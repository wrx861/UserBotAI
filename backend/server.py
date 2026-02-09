from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import aiofiles
import hashlib
import hmac
import time
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import jwt as pyjwt

from bot.database import BotDatabase
from bot.media_handler import list_media_files

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

bot_db = BotDatabase(db)
bot_task = None

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

MEDIA_DIR = ROOT_DIR / "media"
MEDIA_DIR.mkdir(exist_ok=True)


# ── Модели ──────────────────────────────────────────────
class BotStatusResponse(BaseModel):
    is_running: bool = False
    started_at: Optional[str] = None
    total_messages: int = 0
    active_chats: int = 0
    silenced_chats: int = 0
    total_images_analyzed: int = 0
    total_media_sent: int = 0
    telegram_configured: bool = False
    auth_status: str = "not_configured"
    phone_number: str = ""


class BotConfigResponse(BaseModel):
    silence_duration_min: int = 30
    history_limit: int = 20
    gemini_model: str = "gemini-2.0-flash"
    auto_reply: bool = True
    temperature: float = 0.7


class BotConfigUpdate(BaseModel):
    silence_duration_min: Optional[int] = None
    history_limit: Optional[int] = None
    gemini_model: Optional[str] = None
    auto_reply: Optional[bool] = None
    temperature: Optional[float] = None


class ConversationSummary(BaseModel):
    chat_id: str
    username: Optional[str] = None
    message_count: int = 0
    last_message_at: Optional[str] = None
    is_silenced: bool = False


class ActivityLogEntry(BaseModel):
    id: str
    timestamp: str
    event_type: str
    chat_id: Optional[str] = None
    username: Optional[str] = None
    details: str


class MediaTemplateEntry(BaseModel):
    tag: str
    filename: str
    media_type: str
    size_bytes: int = 0
    description: str = ""


class TestMessageRequest(BaseModel):
    chat_id: str
    text: str
    username: Optional[str] = "test_user"


class TestMessageResponse(BaseModel):
    ai_response: str
    media_tags: list
    clean_text: str


class SendCodeRequest(BaseModel):
    phone_number: str


class VerifyCodeRequest(BaseModel):
    phone_number: str
    code: str


class Verify2FARequest(BaseModel):
    password: str


class TelegramCredsRequest(BaseModel):
    api_id: str
    api_hash: str
    phone_number: str
    admin_user_id: Optional[str] = ""


class CustomPromptRequest(BaseModel):
    prompt: str


class MediaRuleRequest(BaseModel):
    tag: str
    description: str


class AISettingsRequest(BaseModel):
    provider: str = "gemini"
    model: str = "gemini-2.0-flash"
    api_keys: Optional[dict] = None  # {"openai": "sk-...", "gemini": "AIza...", "groq": "gsk_..."}


class AISettingsResponse(BaseModel):
    provider: str = "gemini"
    model: str = "gemini-2.0-flash"
    api_keys: dict = {}
    providers_list: list = []


class VoiceSettingsRequest(BaseModel):
    voice_enabled: bool = False
    voice_mode: str = "voice_only"  # "off", "voice_only", "always"
    voice_id: str = "pNInz6obpgDQGcFmaJgB"
    tts_model: str = "eleven_multilingual_v2"
    stt_model: str = "scribe_v2"
    language: str = "ru"
    elevenlabs_api_key: Optional[str] = None


class VoiceSettingsResponse(BaseModel):
    voice_enabled: bool = False
    voice_id: str = "pNInz6obpgDQGcFmaJgB"
    elevenlabs_configured: bool = False
    voices: list = []


# ── Auth модели ─────────────────────────────────────────
class AuthSetupRequest(BaseModel):
    bot_token: str
    bot_username: str

class TelegramAuthRequest(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = ""
    username: Optional[str] = ""
    photo_url: Optional[str] = ""
    auth_date: int
    hash: str


# ── Auth хелперы ────────────────────────────────────────
async def get_jwt_secret():
    """Получить или создать JWT secret из БД."""
    doc = await db.auth_config.find_one({"_id": "jwt_secret"})
    if doc:
        return doc["secret"]
    secret = secrets.token_hex(32)
    await db.auth_config.update_one(
        {"_id": "jwt_secret"},
        {"$set": {"secret": secret}},
        upsert=True,
    )
    return secret


async def get_auth_setup():
    """Получить настройки auth (bot_token, bot_username)."""
    doc = await db.auth_config.find_one({"_id": "auth_setup"})
    if not doc:
        return None
    return doc


def verify_telegram_auth(data: dict, bot_token: str) -> bool:
    """Проверить подпись Telegram Login Widget."""
    check_hash = data.pop("hash", "")
    # Сортируем и формируем строку проверки
    data_check_arr = sorted([f"{k}={v}" for k, v in data.items() if v is not None and v != ""])
    data_check_string = "\n".join(data_check_arr)
    # SHA256(bot_token) → secret key
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    # HMAC-SHA256
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return computed_hash == check_hash


async def get_current_user(request: Request):
    """Dependency — проверяет JWT и возвращает пользователя или None."""
    # Если auth не настроен → пускаем всех
    auth_setup = await get_auth_setup()
    if not auth_setup:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    token = auth_header.split(" ", 1)[1]
    try:
        jwt_secret = await get_jwt_secret()
        payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
        return payload
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Сессия истекла")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Невалидный токен")


async def require_auth(request: Request):
    """Dependency — требует авторизации если auth настроен."""
    return await get_current_user(request)


# ── Хелперы ──────────────────────────────────────────────
async def get_telegram_creds():
    """Get TG creds from MongoDB first, fallback to env."""
    doc = await db.telegram_creds.find_one({"_id": "main"}, {"_id": 0})
    if doc and doc.get("api_id"):
        return doc
    from bot.config import BotConfig
    return {
        "api_id": BotConfig.TELEGRAM_API_ID,
        "api_hash": BotConfig.TELEGRAM_API_HASH,
        "phone_number": BotConfig.TELEGRAM_PHONE,
        "admin_user_id": str(BotConfig.ADMIN_USER_ID) if BotConfig.ADMIN_USER_ID else ""
    }


def has_telegram_creds_sync(creds):
    return bool(creds.get("api_id") and creds.get("api_hash"))


async def get_ai_settings():
    """Получить AI провайдер/модель/ключи из MongoDB."""
    doc = await db.ai_settings.find_one({"_id": "main"}, {"_id": 0})
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not doc:
        return {
            "provider": "gemini",
            "model": "gemini-2.0-flash",
            "api_keys": {"gemini": gemini_key},
        }
    # Объединяем ключи из .env и из БД
    api_keys = doc.get("api_keys", {})
    if not api_keys.get("gemini") and gemini_key:
        api_keys["gemini"] = gemini_key
    doc["api_keys"] = api_keys
    return doc


def create_ai_client_from_settings(settings):
    from bot.gemini_client import AIClient
    provider = settings.get("provider", "gemini")
    model = settings.get("model", "gemini-2.0-flash")
    api_keys = settings.get("api_keys", {})

    # Ключ для выбранного провайдера
    if provider == "groq":
        api_key = api_keys.get("groq", "")
    elif provider == "openai":
        api_key = api_keys.get("openai", "")
    elif provider == "gemini":
        api_key = api_keys.get("gemini", "")
    else:
        api_key = api_keys.get(provider, "")

    return AIClient(
        provider=provider,
        model=model,
        api_key=api_key,
    )


# ── API маршруты ────────────────────────────────────────

# ── Auth маршруты (не требуют авторизации) ──────────────
@api_router.get("/auth/config")
async def get_auth_config():
    """Проверить настроена ли авторизация."""
    auth_setup = await get_auth_setup()
    if not auth_setup:
        return {"configured": False, "bot_username": ""}
    return {
        "configured": True,
        "bot_username": auth_setup.get("bot_username", ""),
    }


@api_router.post("/auth/setup")
async def setup_auth(req: AuthSetupRequest):
    """Первоначальная настройка: сохранить bot_token + bot_username."""
    existing = await get_auth_setup()
    if existing:
        # Если уже настроено — разрешаем менять только авторизованным
        # Но для первой настройки — пропускаем
        raise HTTPException(status_code=400, detail="Авторизация уже настроена")

    await db.auth_config.update_one(
        {"_id": "auth_setup"},
        {"$set": {
            "bot_token": req.bot_token,
            "bot_username": req.bot_username.replace("@", "").strip(),
        }},
        upsert=True,
    )
    logger.info(f"Auth настроен: @{req.bot_username}")
    return {"status": "ok"}


@api_router.post("/auth/telegram")
async def auth_telegram(req: TelegramAuthRequest):
    """Верификация данных Telegram Login Widget и выдача JWT."""
    auth_setup = await get_auth_setup()
    if not auth_setup:
        raise HTTPException(status_code=400, detail="Авторизация не настроена")

    bot_token = auth_setup["bot_token"]

    # Проверяем auth_date (не старше 5 минут)
    if abs(time.time() - req.auth_date) > 300:
        raise HTTPException(status_code=401, detail="Данные авторизации устарели")

    # Собираем данные для проверки хеша
    auth_data = {}
    auth_data["id"] = req.id
    auth_data["first_name"] = req.first_name
    if req.last_name:
        auth_data["last_name"] = req.last_name
    if req.username:
        auth_data["username"] = req.username
    if req.photo_url:
        auth_data["photo_url"] = req.photo_url
    auth_data["auth_date"] = req.auth_date

    # Проверяем подпись
    if not verify_telegram_auth(dict(auth_data, hash=req.hash), bot_token):
        raise HTTPException(status_code=401, detail="Невалидная подпись")

    # Проверяем — есть ли уже admin?
    admin_doc = await db.auth_config.find_one({"_id": "admin_user"})
    if admin_doc:
        # Проверяем что это тот же пользователь
        if admin_doc["telegram_id"] != req.id:
            raise HTTPException(status_code=403, detail="Доступ запрещён. Вы не являетесь администратором.")
    else:
        # Первый вход — сохраняем как админа
        await db.auth_config.update_one(
            {"_id": "admin_user"},
            {"$set": {
                "telegram_id": req.id,
                "first_name": req.first_name,
                "last_name": req.last_name or "",
                "username": req.username or "",
                "photo_url": req.photo_url or "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        logger.info(f"Admin установлен: {req.first_name} (ID: {req.id})")

    # Генерируем JWT (срок 7 дней)
    jwt_secret = await get_jwt_secret()
    payload = {
        "telegram_id": req.id,
        "first_name": req.first_name,
        "username": req.username or "",
        "photo_url": req.photo_url or "",
        "exp": int(time.time()) + 7 * 24 * 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, jwt_secret, algorithm="HS256")

    return {
        "token": token,
        "user": {
            "telegram_id": req.id,
            "first_name": req.first_name,
            "username": req.username or "",
            "photo_url": req.photo_url or "",
        },
    }


@api_router.get("/auth/me")
async def auth_me(request: Request):
    """Проверить текущую сессию."""
    auth_setup = await get_auth_setup()
    if not auth_setup:
        return {"authenticated": False, "auth_required": False}

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return {"authenticated": False, "auth_required": True}

    token = auth_header.split(" ", 1)[1]
    try:
        jwt_secret = await get_jwt_secret()
        payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
        return {
            "authenticated": True,
            "auth_required": True,
            "user": {
                "telegram_id": payload["telegram_id"],
                "first_name": payload["first_name"],
                "username": payload.get("username", ""),
                "photo_url": payload.get("photo_url", ""),
            },
        }
    except Exception:
        return {"authenticated": False, "auth_required": True}


@api_router.post("/auth/logout")
async def auth_logout():
    """Выход (клиент удаляет токен)."""
    return {"status": "ok"}


@api_router.post("/auth/reset")
async def auth_reset(request: Request):
    """Сбросить настройки авторизации (только для админа)."""
    user = await get_current_user(request)
    await db.auth_config.delete_many({})
    logger.info("Auth настройки сброшены")
    return {"status": "ok"}


@api_router.get("/")
async def root():
    return {"message": "Support AI Bot API", "version": "1.0.0"}


@api_router.get("/bot/status", response_model=BotStatusResponse)
async def get_bot_status():
    status = await bot_db.get_bot_status()
    stats = await bot_db.get_stats()
    auth_state = await bot_db.get_auth_state()
    creds = await get_telegram_creds()
    has_creds = has_telegram_creds_sync(creds)

    if status.get("is_running"):
        auth_status = "running"
    elif auth_state == "code_sent":
        auth_status = "code_sent"
    elif auth_state == "authorized":
        auth_status = "session_ready"
    elif has_creds:
        auth_status = "needs_auth"
    else:
        auth_status = "not_configured"

    return BotStatusResponse(
        is_running=status.get("is_running", False),
        started_at=status.get("started_at"),
        total_messages=stats["total_messages"],
        active_chats=stats["total_chats"],
        silenced_chats=stats["silenced_chats"],
        total_images_analyzed=stats["total_images_analyzed"],
        total_media_sent=stats["total_media_sent"],
        telegram_configured=has_creds,
        auth_status=auth_status,
        phone_number=creds.get("phone_number", "") or ""
    )


@api_router.get("/bot/config", response_model=BotConfigResponse)
async def get_bot_config():
    config_doc = await db.bot_config.find_one({"_id": "main"}, {"_id": 0})
    if not config_doc:
        return BotConfigResponse()
    return BotConfigResponse(**{
        k: v for k, v in config_doc.items()
        if k in BotConfigResponse.model_fields
    })


@api_router.post("/bot/config", response_model=BotConfigResponse)
async def update_bot_config(config: BotConfigUpdate):
    update_data = {k: v for k, v in config.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    await db.bot_config.update_one(
        {"_id": "main"},
        {"$set": update_data},
        upsert=True
    )
    return await get_bot_config()


@api_router.get("/bot/conversations", response_model=List[ConversationSummary])
async def get_conversations():
    pipeline = [
        {"$group": {
            "_id": "$chat_id",
            "username": {"$last": "$username"},
            "message_count": {"$sum": 1},
            "last_message_at": {"$max": "$timestamp"}
        }},
        {"$sort": {"last_message_at": -1}},
        {"$limit": 50}
    ]
    convos = await db.messages.aggregate(pipeline).to_list(50)
    now = datetime.now(timezone.utc).isoformat()
    results = []
    for c in convos:
        silence = await db.silence_timers.find_one(
            {"chat_id": str(c["_id"]), "expires_at": {"$gt": now}},
            {"_id": 0}
        )
        results.append(ConversationSummary(
            chat_id=str(c["_id"]),
            username=c.get("username"),
            message_count=c["message_count"],
            last_message_at=c.get("last_message_at"),
            is_silenced=silence is not None
        ))
    return results


@api_router.get("/bot/activity", response_model=List[ActivityLogEntry])
async def get_activity_log():
    logs = await db.activity_log.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)
    return [ActivityLogEntry(**log) for log in logs]


@api_router.get("/bot/media-templates", response_model=List[MediaTemplateEntry])
async def get_media_templates():
    files = list_media_files()
    result = []
    for f in files:
        rule = await db.media_rules.find_one({"tag": f["tag"]}, {"_id": 0})
        f["description"] = rule.get("description", "") if rule else ""
        result.append(MediaTemplateEntry(**f))
    return result


@api_router.post("/bot/test-message", response_model=TestMessageResponse)
async def test_message(req: TestMessageRequest):
    from bot.media_handler import parse_media_tags

    system_prompt = await build_system_prompt()
    ai_settings = await get_ai_settings()
    ai_client = create_ai_client_from_settings(ai_settings)

    # Применяем температуру из конфига
    config_doc = await db.bot_config.find_one({"_id": "main"}, {"_id": 0})
    if config_doc:
        ai_client.temperature = config_doc.get("temperature", 0.7)

    await bot_db.save_message(req.chat_id, "user", req.text, req.username)
    history = await bot_db.get_history(req.chat_id)

    try:
        response = await ai_client.get_response(
            req.chat_id, history, system_prompt, req.text
        )
    except ValueError as e:
        # Понятная ошибка от AI клиента
        logger.warning(f"AI ошибка в тесте: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Неожиданная ошибка AI в тесте: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка AI: {str(e)[:200]}")

    clean_text, media_tags = parse_media_tags(response)
    await bot_db.save_message(req.chat_id, "assistant", clean_text)
    await bot_db.log_activity(
        "test_response", req.chat_id,
        f"Тест: {clean_text[:80]}", req.username
    )

    return TestMessageResponse(
        ai_response=response,
        media_tags=[{"type": t, "tag": tag} for t, tag in media_tags],
        clean_text=clean_text
    )


# ── Управление Telegram данными ──────────────────────────

@api_router.get("/bot/settings/telegram")
async def get_telegram_settings():
    creds = await get_telegram_creds()
    return {
        "api_id": creds.get("api_id", ""),
        "api_hash": creds.get("api_hash", ""),
        "phone_number": creds.get("phone_number", ""),
        "admin_user_id": creds.get("admin_user_id", "")
    }


@api_router.post("/bot/settings/telegram")
async def save_telegram_settings(req: TelegramCredsRequest):
    await db.telegram_creds.update_one(
        {"_id": "main"},
        {"$set": {
            "api_id": req.api_id,
            "api_hash": req.api_hash,
            "phone_number": req.phone_number,
            "admin_user_id": req.admin_user_id
        }},
        upsert=True
    )
    # Reset auth state since creds changed
    await bot_db.set_auth_state("none")
    await bot_db.update_bot_status(is_running=False)
    return {"status": "saved"}


# ── Управление промптом ────────────────────────────

@api_router.get("/bot/settings/prompt")
async def get_custom_prompt():
    doc = await db.custom_prompt.find_one({"_id": "main"}, {"_id": 0})
    from bot.system_prompt import SYSTEM_PROMPT
    default = SYSTEM_PROMPT.replace("{media_templates}", "(автоматически подставляется)")
    return {
        "prompt": doc.get("prompt", "") if doc else "",
        "default_prompt": default
    }


@api_router.post("/bot/settings/prompt")
async def save_custom_prompt(req: CustomPromptRequest):
    await db.custom_prompt.update_one(
        {"_id": "main"},
        {"$set": {"prompt": req.prompt}},
        upsert=True
    )
    return {"status": "saved"}


# ── Медиа загрузка и правила ────────────────────────────────

@api_router.post("/bot/media/upload")
async def upload_media(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Файл не выбран")

    safe_name = file.filename.replace(" ", "_")
    filepath = MEDIA_DIR / safe_name

    async with aiofiles.open(str(filepath), "wb") as f:
        content = await file.read()
        await f.write(content)

    tag = Path(safe_name).stem
    await bot_db.log_activity("media_uploaded", details=f"Загружен: {safe_name}")

    return {"status": "uploaded", "filename": safe_name, "tag": tag, "size": len(content)}


@api_router.delete("/bot/media/{tag}")
async def delete_media(tag: str):
    from bot.media_handler import MEDIA_EXTENSIONS
    deleted = False
    for exts in MEDIA_EXTENSIONS.values():
        for ext in exts:
            filepath = MEDIA_DIR / f"{tag}{ext}"
            if filepath.exists():
                filepath.unlink()
                deleted = True
    if not deleted:
        raise HTTPException(404, "Файл не найден")
    await db.media_rules.delete_one({"tag": tag})
    await bot_db.log_activity("media_deleted", details=f"Удалён: {tag}")
    return {"status": "deleted", "tag": tag}


@api_router.post("/bot/media/rules")
async def save_media_rule(req: MediaRuleRequest):
    await db.media_rules.update_one(
        {"tag": req.tag},
        {"$set": {"tag": req.tag, "description": req.description}},
        upsert=True
    )
    return {"status": "saved"}


@api_router.get("/bot/media/rules")
async def get_media_rules():
    rules = await db.media_rules.find({}, {"_id": 0}).to_list(100)
    return rules


# ── AI настройки ───────────────────────────────

@api_router.get("/bot/settings/ai")
async def get_ai_settings_endpoint():
    from bot.gemini_client import PROVIDERS
    settings = await get_ai_settings()
    providers_list = [
        {
            "id": pid,
            "name": p["name"],
            "models": p["models"],
            "default_model": p["default_model"],
            "needs_key": p["needs_key"],
        }
        for pid, p in PROVIDERS.items()
    ]
    return {
        "provider": settings.get("provider", "gemini"),
        "model": settings.get("model", "gemini-2.5-flash"),
        "api_keys": {k: "***" + v[-4:] if v and len(v) > 4 else "" for k, v in settings.get("api_keys", {}).items()},
        "providers_list": providers_list,
    }


@api_router.post("/bot/settings/ai")
async def save_ai_settings(req: AISettingsRequest):
    update = {
        "provider": req.provider,
        "model": req.model,
    }
    if req.api_keys:
        existing = await db.ai_settings.find_one({"_id": "main"}, {"_id": 0})
        existing_keys = existing.get("api_keys", {}) if existing else {}
        for k, v in req.api_keys.items():
            if v and not v.startswith("***"):
                existing_keys[k] = v
        update["api_keys"] = existing_keys
    await db.ai_settings.update_one(
        {"_id": "main"},
        {"$set": update},
        upsert=True
    )
    await bot_db.log_activity("ai_settings_changed", details=f"Провайдер: {req.provider}, Модель: {req.model}")
    return {"status": "saved"}


# ── Голосовые настройки ────────────────────────────

@api_router.get("/bot/settings/voice")
async def get_voice_settings():
    from bot.voice_handler import get_voice_handler, TTS_MODELS, STT_MODELS, TTS_LANGUAGES
    handler = get_voice_handler()
    doc = await db.voice_settings.find_one({"_id": "main"}, {"_id": 0})

    voice_enabled = doc.get("voice_enabled", False) if doc else False
    voice_mode = doc.get("voice_mode", "voice_only") if doc else "voice_only"
    voice_id = doc.get("voice_id", "pNInz6obpgDQGcFmaJgB") if doc else "pNInz6obpgDQGcFmaJgB"
    tts_model = doc.get("tts_model", "eleven_multilingual_v2") if doc else "eleven_multilingual_v2"
    stt_model = doc.get("stt_model", "scribe_v2") if doc else "scribe_v2"
    language = doc.get("language", "ru") if doc else "ru"

    # Check if API key is set (from DB or env)
    stored_key = doc.get("elevenlabs_api_key", "") if doc else ""
    env_key = os.environ.get("ELEVENLABS_API_KEY", "")
    active_key = stored_key or env_key

    # Sync handler with the active key
    if active_key and handler.api_key != active_key:
        handler.update_key(active_key)

    # Get voices list
    voices = []
    if handler.is_configured:
        try:
            voices = await handler.get_voices()
        except Exception as e:
            logger.warning(f"Failed to fetch voices: {e}")

    return {
        "voice_enabled": voice_enabled,
        "voice_mode": voice_mode,
        "voice_id": voice_id,
        "tts_model": tts_model,
        "stt_model": stt_model,
        "language": language,
        "elevenlabs_configured": handler.is_configured,
        "has_api_key": bool(active_key),
        "api_key_source": "saved" if stored_key else ("env" if env_key else "none"),
        "api_key_masked": f"...{active_key[-8:]}" if active_key and len(active_key) > 8 else "",
        "voices": voices,
        "tts_models": [
            {"id": mid, **info} for mid, info in TTS_MODELS.items()
        ],
        "stt_models": [
            {"id": mid, **info} for mid, info in STT_MODELS.items()
        ],
        "languages": [
            {"code": code, "name": name} for code, name in TTS_LANGUAGES.items()
        ],
    }


@api_router.post("/bot/settings/voice")
async def save_voice_settings(req: VoiceSettingsRequest):
    from bot.voice_handler import get_voice_handler, reset_voice_handler

    update_data = {
        "voice_enabled": req.voice_enabled,
        "voice_mode": req.voice_mode,
        "voice_id": req.voice_id,
        "tts_model": req.tts_model,
        "stt_model": req.stt_model,
        "language": req.language,
    }

    # Save API key if provided
    if req.elevenlabs_api_key is not None:
        update_data["elevenlabs_api_key"] = req.elevenlabs_api_key
        # Reset handler to pick up new key
        reset_voice_handler()
        handler = get_voice_handler()
        handler.update_key(req.elevenlabs_api_key)

    await db.voice_settings.update_one(
        {"_id": "main"},
        {"$set": update_data},
        upsert=True
    )
    status = "вкл" if req.voice_enabled else "выкл"
    await bot_db.log_activity("voice_settings_changed", details=f"Голосовые ответы: {status}")
    return {"status": "saved"}



# ── Превью голоса ──────────────────────────────

@api_router.get("/bot/voice/preview/{voice_id}")
async def get_voice_preview(voice_id: str):
    """Generate and serve a Russian TTS preview for a given voice."""
    from bot.voice_handler import get_voice_handler
    from fastapi.responses import FileResponse

    handler = get_voice_handler()

    # Sync handler key from DB/env
    doc = await db.voice_settings.find_one({"_id": "main"}, {"_id": 0})
    stored_key = doc.get("elevenlabs_api_key", "") if doc else ""
    env_key = os.environ.get("ELEVENLABS_API_KEY", "")
    active_key = stored_key or env_key
    if active_key and handler.api_key != active_key:
        handler.update_key(active_key)

    if not handler.is_configured:
        raise HTTPException(400, "ElevenLabs API ключ не настроен")

    cache_dir = str(MEDIA_DIR / "voice_previews")
    try:
        file_path = await handler.generate_preview(voice_id, cache_dir)
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(500, "Не удалось сгенерировать превью")
        return FileResponse(
            file_path,
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Voice preview error: {e}")
        raise HTTPException(500, f"Ошибка генерации: {str(e)}")


# ── Авторизация Telegram ──────────────────────────────────────

@api_router.post("/bot/auth/send-code")
async def auth_send_code(req: SendCodeRequest):
    creds = await get_telegram_creds()
    if not has_telegram_creds_sync(creds):
        raise HTTPException(400, "Telegram API ID и Hash не настроены")
    try:
        from bot.telegram_bot import get_bot
        bot = get_bot(db)
        bot.set_creds(creds["api_id"], creds["api_hash"])
        result = await bot.send_auth_code(req.phone_number)
        await bot_db.set_auth_state("code_sent")
        return result
    except Exception as e:
        logger.error(f"Ошибка отправки кода: {e}")
        raise HTTPException(400, f"Ошибка: {str(e)}")


@api_router.post("/bot/auth/verify-code")
async def auth_verify_code(req: VerifyCodeRequest):
    try:
        from bot.telegram_bot import get_bot
        bot = get_bot(db)
        result = await bot.verify_auth_code(req.phone_number, req.code)

        if result["status"] == "authorized":
            await bot_db.set_auth_state("authorized")
            global bot_task
            if bot_task is None or bot_task.done():
                from bot.telegram_bot import start_bot
                bot_task = asyncio.create_task(start_bot(db))
                logger.info("Бот запущен после авторизации")

        return result
    except Exception as e:
        logger.error(f"Ошибка верификации кода: {e}")
        raise HTTPException(400, f"Ошибка: {str(e)}")


@api_router.post("/bot/auth/verify-2fa")
async def auth_verify_2fa(req: Verify2FARequest):
    try:
        from bot.telegram_bot import get_bot
        bot = get_bot(db)
        result = await bot.verify_2fa(req.password)

        if result["status"] == "authorized":
            await bot_db.set_auth_state("authorized")
            global bot_task
            if bot_task is None or bot_task.done():
                from bot.telegram_bot import start_bot
                bot_task = asyncio.create_task(start_bot(db))

        return result
    except Exception as e:
        logger.error(f"Ошибка 2FA: {e}")
        raise HTTPException(400, f"Ошибка: {str(e)}")


@api_router.post("/bot/start")
async def start_bot_endpoint():
    global bot_task
    if bot_task and not bot_task.done():
        return {"status": "already_running"}
    try:
        from bot.telegram_bot import start_bot
        bot_task = asyncio.create_task(start_bot(db))
        return {"status": "started"}
    except Exception as e:
        raise HTTPException(400, f"Ошибка запуска: {str(e)}")


@api_router.post("/bot/stop")
async def stop_bot_endpoint():
    global bot_task
    if bot_task and not bot_task.done():
        bot_task.cancel()
        await bot_db.update_bot_status(is_running=False)
        return {"status": "stopped"}
    return {"status": "not_running"}


# ── Обучение / Сканирование ───────────────────────────

class ScanRequest(BaseModel):
    max_chats: int = 50
    messages_per_chat: int = 100


@api_router.post("/bot/training/scan")
async def scan_dialogs(req: ScanRequest):
    """Scan existing Telegram dialogs to learn the admin's communication style."""
    from bot.telegram_bot import get_bot
    bot = get_bot(db)
    if not bot._running:
        raise HTTPException(400, "Бот должен быть запущен для сканирования диалогов")
    try:
        result = await bot.scan_dialogs(
            max_chats=req.max_chats,
            messages_per_chat=req.messages_per_chat
        )
        return result
    except Exception as e:
        logger.error(f"Ошибка сканирования: {e}")
        raise HTTPException(400, f"Ошибка: {str(e)}")


@api_router.get("/bot/training/status")
async def get_training_status():
    """Get training/scan status and style profile."""
    style_doc = await db.style_profile.find_one({"_id": "main"}, {"_id": 0})
    total_pairs = await db.training_data.count_documents({})
    few_shot = style_doc.get("few_shot_examples", []) if style_doc else []
    training_enabled = style_doc.get("training_enabled", True) if style_doc else True
    return {
        "has_training_data": total_pairs > 0,
        "training_enabled": training_enabled,
        "total_examples": total_pairs,
        "scanned_chats": style_doc.get("scanned_chats", 0) if style_doc else 0,
        "scanned_at": style_doc.get("scanned_at") if style_doc else None,
        "style_profile": style_doc.get("profile", "") if style_doc else "",
        "few_shot_count": len(few_shot),
        "few_shot_examples": few_shot[:5]  # Preview of first 5 examples
    }


@api_router.post("/bot/training/toggle")
async def toggle_training():
    """Toggle training data usage on/off."""
    style_doc = await db.style_profile.find_one({"_id": "main"})
    current = style_doc.get("training_enabled", True) if style_doc else True
    new_val = not current
    await db.style_profile.update_one(
        {"_id": "main"},
        {"$set": {"training_enabled": new_val}},
        upsert=True
    )
    status = "вкл" if new_val else "выкл"
    await bot_db.log_activity("training_toggled", details=f"Обучение: {status}")
    return {"training_enabled": new_val}


@api_router.delete("/bot/training/reset")
async def reset_training():
    """Clear all training data."""
    await db.training_data.delete_many({})
    await db.style_profile.delete_one({"_id": "main"})
    await bot_db.log_activity("training_reset", details="Данные обучения сброшены")
    return {"status": "reset"}


# ── Сборка системного промпта ───────────────────────────────

async def build_system_prompt():
    from bot.system_prompt import SYSTEM_PROMPT
    custom_doc = await db.custom_prompt.find_one({"_id": "main"}, {"_id": 0})
    custom_prompt = custom_doc.get("prompt", "") if custom_doc else ""

    files = list_media_files()
    rules = {r["tag"]: r["description"] for r in await db.media_rules.find({}, {"_id": 0}).to_list(100)}

    if files:
        templates_str = "\n".join(
            f"- [{m['media_type']}:{m['tag']}] — {m['filename']}"
            + (f" — Когда отправлять: {rules[m['tag']]}" if m['tag'] in rules else "")
            for m in files
        )
    else:
        templates_str = "Медиа-шаблоны отсутствуют."

    # Get style profile and few-shot examples from training data
    style_doc = await db.style_profile.find_one({"_id": "main"}, {"_id": 0})
    style_section = ""
    training_enabled = style_doc.get("training_enabled", True) if style_doc else True

    if training_enabled and style_doc and style_doc.get("profile"):
        style_section = f"\n\nСТИЛЬ ОБЩЕНИЯ (обучен на {style_doc.get('total_examples', 0)} примерах из {style_doc.get('scanned_chats', 0)} личных чатов):\n{style_doc['profile']}"

        # Add few-shot examples if available
        few_shot = style_doc.get("few_shot_examples", [])
        if few_shot:
            style_section += "\n\nПРИМЕРЫ РЕАЛЬНЫХ ДИАЛОГОВ (подражай этому стилю):\n"
            for i, ex in enumerate(few_shot[:15], 1):
                style_section += f"\nПример {i}:\n"
                style_section += f"  Клиент: {ex.get('user', '')}\n"
                style_section += f"  Оператор: {ex.get('admin', '')}\n"

    if custom_prompt:
        return custom_prompt + style_section + "\n\nДОСТУПНЫЕ МЕДИА-ШАБЛОНЫ:\n" + templates_str
    else:
        return SYSTEM_PROMPT.format(media_templates=templates_str) + style_section


# ── Подключение маршрутов ──────────────────────────────────────
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth Middleware ─────────────────────────────────────
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Защита /api/bot/* маршрутов — если auth настроен, требуем JWT."""
    path = request.url.path

    # Пропускаем auth эндпоинты, корень API, статику
    if (
        path.startswith("/api/auth/")
        or path == "/api/"
        or path == "/api"
        or not path.startswith("/api/")
    ):
        return await call_next(request)

    # Проверяем настроена ли авторизация
    auth_setup = await get_auth_setup()
    if not auth_setup:
        # Auth не настроен — пропускаем
        return await call_next(request)

    # Auth настроен — проверяем JWT
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=401,
            content={"detail": "Требуется авторизация"},
        )

    token = auth_header.split(" ", 1)[1]
    try:
        jwt_secret = await get_jwt_secret()
        pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=401,
            content={"detail": "Сессия истекла"},
        )
    except pyjwt.InvalidTokenError:
        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=401,
            content={"detail": "Невалидный токен"},
        )

    return await call_next(request)


# ── Жизненный цикл ───────────────────────────────────────────
@app.on_event("startup")
async def startup():
    existing = await db.bot_config.find_one({"_id": "main"})
    if not existing:
        await db.bot_config.insert_one({
            "_id": "main",
            **BotConfigResponse().model_dump()
        })

    creds = await get_telegram_creds()
    if has_telegram_creds_sync(creds):
        auth_state = await bot_db.get_auth_state()
        if auth_state == "authorized":
            session_path = ROOT_DIR / "support_ai_bot.session"
            if session_path.exists():
                try:
                    from bot.telegram_bot import get_bot
                    bot = get_bot(db)
                    bot.set_creds(creds["api_id"], creds["api_hash"])
                    is_valid = await bot.check_session_valid()
                    if is_valid:
                        from bot.telegram_bot import start_bot
                        global bot_task
                        bot_task = asyncio.create_task(start_bot(db))
                        logger.info("Бот запущен с существующей сессией")
                    else:
                        await bot_db.set_auth_state("none")
                        logger.info("Сессия невалидна — требуется повторная авторизация")
                except Exception as e:
                    logger.warning(f"Не удалось запустить бота: {e}")
            else:
                await bot_db.set_auth_state("none")
                logger.info("Файл сессии не найден — требуется авторизация")
        else:
            logger.info("Ожидание авторизации через веб-интерфейс")
    else:
        logger.info("Telegram не настроен — укажите данные в веб-интерфейсе")


@app.on_event("shutdown")
async def shutdown():
    if bot_task:
        bot_task.cancel()
    client.close()
