import uuid
import base64
import logging
import asyncio

logger = logging.getLogger(__name__)

# Провайдеры → список моделей
# Документация:
#   Gemini:  https://ai.google.dev/gemini-api/docs/models
#   OpenAI:  https://platform.openai.com/docs/models
#   Groq:    https://console.groq.com/docs/models
PROVIDERS = {
    "gemini": {
        "name": "Google Gemini",
        "models": [
            {"id": "gemini-3-flash-preview",  "label": "Gemini 3.0 Flash",      "vision": True,  "ctx": "1M"},
            {"id": "gemini-3-pro-preview",    "label": "Gemini 3.0 Pro",        "vision": True,  "ctx": "1M"},
            {"id": "gemini-2.5-flash",        "label": "Gemini 2.5 Flash",      "vision": True,  "ctx": "1M"},
            {"id": "gemini-2.5-flash-lite",   "label": "Gemini 2.5 Flash Lite", "vision": True,  "ctx": "1M"},
            {"id": "gemini-2.5-pro",          "label": "Gemini 2.5 Pro",        "vision": True,  "ctx": "1M"},
            {"id": "gemini-2.0-flash",        "label": "Gemini 2.0 Flash",      "vision": True,  "ctx": "1M"},
            {"id": "gemini-2.0-flash-lite",   "label": "Gemini 2.0 Flash Lite", "vision": True,  "ctx": "1M"},
        ],
        "default_model": "gemini-2.5-flash",
        "needs_key": True,
    },
    "openai": {
        "name": "OpenAI",
        "models": [
            {"id": "gpt-5.2",        "label": "GPT-5.2",         "vision": True,  "ctx": "400K"},
            {"id": "gpt-5.1",        "label": "GPT-5.1",         "vision": True,  "ctx": "1M"},
            {"id": "gpt-5",          "label": "GPT-5",           "vision": True,  "ctx": "1M"},
            {"id": "gpt-4.1",        "label": "GPT-4.1",         "vision": True,  "ctx": "1M"},
            {"id": "gpt-4.1-mini",   "label": "GPT-4.1 Mini",    "vision": True,  "ctx": "1M"},
            {"id": "gpt-4.1-nano",   "label": "GPT-4.1 Nano",    "vision": True,  "ctx": "1M"},
            {"id": "gpt-4o",         "label": "GPT-4o",          "vision": True,  "ctx": "128K"},
            {"id": "gpt-4o-mini",    "label": "GPT-4o Mini",     "vision": True,  "ctx": "128K"},
            {"id": "o4-mini",        "label": "o4-mini",         "vision": True,  "ctx": "200K"},
            {"id": "o3-mini",        "label": "o3-mini",         "vision": False, "ctx": "200K"},
        ],
        "default_model": "gpt-4.1-mini",
        "needs_key": True,
    },
    "groq": {
        "name": "Groq",
        "models": [
            {"id": "llama-3.3-70b-versatile",                      "label": "Llama 3.3 70B",           "vision": False, "ctx": "128K"},
            {"id": "llama-3.1-8b-instant",                         "label": "Llama 3.1 8B",            "vision": False, "ctx": "128K"},
            {"id": "meta-llama/llama-4-maverick-17b-128e-instruct", "label": "Llama 4 Maverick 17B",    "vision": True,  "ctx": "128K"},
            {"id": "meta-llama/llama-4-scout-17b-16e-instruct",     "label": "Llama 4 Scout 17B",       "vision": True,  "ctx": "128K"},
            {"id": "llama-3.2-90b-vision-preview",                 "label": "Llama 3.2 90B Vision",    "vision": True,  "ctx": "128K"},
            {"id": "llama-3.2-11b-vision-preview",                 "label": "Llama 3.2 11B Vision",    "vision": True,  "ctx": "128K"},
            {"id": "deepseek-r1-distill-llama-70b",                "label": "DeepSeek R1 70B",         "vision": False, "ctx": "128K"},
            {"id": "openai/gpt-oss-120b",                          "label": "GPT-OSS 120B",            "vision": False, "ctx": "128K"},
            {"id": "openai/gpt-oss-20b",                           "label": "GPT-OSS 20B",             "vision": False, "ctx": "128K"},
            {"id": "qwen/qwen3-32b",                               "label": "Qwen3 32B",               "vision": False, "ctx": "128K"},
            {"id": "moonshotai/kimi-k2-instruct-0905",             "label": "Kimi K2",                 "vision": False, "ctx": "256K"},
            {"id": "mistral-saba-24b",                             "label": "Mistral Saba 24B",        "vision": False, "ctx": "32K"},
        ],
        "default_model": "llama-3.3-70b-versatile",
        "needs_key": True,
    },
}

def get_model_ids(provider):
    """Вернуть список ID моделей для провайдера."""
    p = PROVIDERS.get(provider, {})
    models = p.get("models", [])
    if models and isinstance(models[0], dict):
        return [m["id"] for m in models]
    return models


class AIClient:
    def __init__(self, provider="gemini", model=None, api_key=None, temperature=0.7):
        self.provider = provider
        self.model = model or PROVIDERS.get(provider, {}).get("default_model", "gemini-2.5-flash")
        self.api_key = api_key
        self.temperature = temperature

    def _get_key(self):
        return self.api_key or None

    async def get_response(self, chat_id, messages_history, system_prompt, user_text):
        if self.provider == "groq":
            return await self._groq_response(chat_id, messages_history, system_prompt, user_text)
        elif self.provider == "openai":
            return await self._openai_response(chat_id, messages_history, system_prompt, user_text)
        else:
            return await self._gemini_response(chat_id, messages_history, system_prompt, user_text)

    async def analyze_image(self, chat_id, image_path, system_prompt, user_text=None):
        if not user_text:
            user_text = "Пользователь отправил скриншот. Проанализируй и помоги с проблемой."

        if self.provider == "groq":
            return await self._groq_response(
                chat_id, [], system_prompt,
                f"{user_text}\n[Пользователь отправил скриншот, но Groq не поддерживает изображения. Ответь что нужно описать проблему текстом.]"
            )
        elif self.provider == "openai":
            return await self._openai_image_response(chat_id, image_path, system_prompt, user_text)
        else:
            return await self._gemini_image_response(chat_id, image_path, system_prompt, user_text)

    # ── Gemini (google-genai SDK) ─────────────────────────────

    async def _gemini_response(self, chat_id, messages_history, system_prompt, user_text):
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"Не удалось импортировать google-genai: {e}")
            raise ValueError("Библиотека google-genai не установлена. Установите: pip install google-genai")

        key = self._get_key()
        if not key:
            raise ValueError("Gemini API ключ не задан. Добавьте его в настройках AI провайдера.")
        
        try:
            client = genai.Client(api_key=key)
        except Exception as e:
            logger.error(f"Не удалось создать Gemini клиент: {e}")
            raise ValueError(f"Ошибка инициализации Gemini: {str(e)[:100]}")

        # Собираем контекст переписки
        if messages_history and len(messages_history) > 1:
            context_parts = []
            for msg in messages_history[:-1]:
                role = "Пользователь" if msg["role"] == "user" else "Ты"
                context_parts.append(f"{role}: {msg['text']}")
            context_str = "\n".join(context_parts)
            full_text = (
                f"[КОНТЕКСТ ПЕРЕПИСКИ — это продолжение диалога, НЕ начинай с приветствия если уже здоровался]\n"
                f"{context_str}\n\n"
                f"Пользователь: {user_text}"
            )
        else:
            full_text = user_text

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=self.temperature,
            max_output_tokens=1024,
        )

        def _sync_call():
            response = client.models.generate_content(
                model=self.model,
                contents=full_text,
                config=config,
            )
            # Проверяем что response.text существует и не пустой
            if response is None:
                raise ValueError("Gemini вернул пустой ответ")
            if hasattr(response, 'text') and response.text:
                return response.text
            # Альтернативный способ получения текста
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content:
                    parts = candidate.content.parts
                    if parts:
                        return parts[0].text
            raise ValueError("Gemini вернул ответ без текста")

        try:
            response_text = await asyncio.to_thread(_sync_call)
        except Exception as e:
            error_str = str(e).lower()
            error_full = str(e)
            logger.error(f"Gemini API ошибка [{self.model}]: {error_full}")
            
            # Детальная обработка ошибок
            if "api key not valid" in error_str or "api_key_invalid" in error_str or "invalid api key" in error_str:
                raise ValueError("Невалидный Gemini API ключ. Проверьте ключ в настройках.")
            elif "401" in error_str or "unauthenticated" in error_str:
                raise ValueError("Ошибка аутентификации Gemini. Проверьте API ключ.")
            elif "403" in error_str or "permission" in error_str:
                raise ValueError("Нет доступа к Gemini API. Проверьте права API ключа.")
            elif "404" in error_str or "not found" in error_str or "does not exist" in error_str:
                raise ValueError(f"Модель {self.model} не найдена. Попробуйте другую модель (например gemini-2.0-flash).")
            elif "429" in error_str or "quota" in error_str or "rate" in error_str or "resource_exhausted" in error_str:
                raise ValueError("Превышен лимит запросов Gemini API. Подождите минуту и попробуйте снова.")
            elif "500" in error_str or "internal" in error_str:
                raise ValueError("Внутренняя ошибка сервера Gemini. Попробуйте позже.")
            elif "timeout" in error_str or "deadline" in error_str:
                raise ValueError("Превышено время ожидания ответа от Gemini. Попробуйте снова.")
            elif "safety" in error_str or "blocked" in error_str:
                raise ValueError("Сообщение заблокировано фильтрами безопасности Gemini.")
            elif "empty" in error_str or "без текста" in error_str or "пустой" in error_str:
                raise ValueError("Gemini вернул пустой ответ. Попробуйте переформулировать вопрос.")
            else:
                # Для неизвестных ошибок показываем краткую версию
                short_error = error_full[:150] if len(error_full) > 150 else error_full
                raise ValueError(f"Ошибка Gemini API: {short_error}")

        if not response_text:
            raise ValueError("Gemini вернул пустой ответ")
            
        logger.info(f"Gemini ответ [{self.model}] для чата {chat_id}: {response_text[:100]}...")
        return response_text

    async def _gemini_image_response(self, chat_id, image_path, system_prompt, user_text):
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"Не удалось импортировать google-genai: {e}")
            raise ValueError("Библиотека google-genai не установлена.")

        key = self._get_key()
        if not key:
            raise ValueError("Gemini API ключ не задан. Добавьте его в настройках AI провайдера.")
            
        try:
            client = genai.Client(api_key=key)
        except Exception as e:
            logger.error(f"Не удалось создать Gemini клиент: {e}")
            raise ValueError(f"Ошибка инициализации Gemini: {str(e)[:100]}")

        # Read and encode image
        try:
            with open(image_path, "rb") as f:
                image_data = f.read()
        except Exception as e:
            logger.error(f"Не удалось прочитать изображение: {e}")
            raise ValueError("Не удалось прочитать изображение")

        mime_type = "image/jpeg"
        if image_path.endswith(".png"):
            mime_type = "image/png"
        elif image_path.endswith(".webp"):
            mime_type = "image/webp"

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=self.temperature,
            max_output_tokens=1024,
        )

        image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)

        def _sync_call():
            response = client.models.generate_content(
                model=self.model,
                contents=[user_text, image_part],
                config=config,
            )
            if response is None:
                raise ValueError("Gemini вернул пустой ответ")
            if hasattr(response, 'text') and response.text:
                return response.text
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content:
                    parts = candidate.content.parts
                    if parts:
                        return parts[0].text
            raise ValueError("Gemini вернул ответ без текста")

        try:
            response_text = await asyncio.to_thread(_sync_call)
        except Exception as e:
            error_str = str(e).lower()
            error_full = str(e)
            logger.error(f"Gemini API ошибка (изображение) [{self.model}]: {error_full}")
            
            if "api key not valid" in error_str or "api_key_invalid" in error_str:
                raise ValueError("Невалидный Gemini API ключ.")
            elif "429" in error_str or "quota" in error_str or "rate" in error_str:
                raise ValueError("Превышен лимит запросов Gemini API. Подождите минуту.")
            elif "safety" in error_str or "blocked" in error_str:
                raise ValueError("Изображение заблокировано фильтрами безопасности Gemini.")
            elif "404" in error_str or "not found" in error_str:
                raise ValueError(f"Модель {self.model} не найдена или не поддерживает изображения.")
            else:
                short_error = error_full[:150] if len(error_full) > 150 else error_full
                raise ValueError(f"Ошибка анализа изображения: {short_error}")

        if not response_text:
            raise ValueError("Gemini вернул пустой ответ при анализе изображения")
            
        logger.info(f"Gemini анализ изображения [{self.model}] для чата {chat_id}: {response_text[:100]}...")
        return response_text

    # ── OpenAI (openai SDK) ───────────────────────────────────

    async def _openai_response(self, chat_id, messages_history, system_prompt, user_text):
        from openai import AsyncOpenAI

        key = self._get_key()
        client = AsyncOpenAI(api_key=key)

        enhanced_system = system_prompt + "\n\nВАЖНО: Если в истории диалога уже были приветствия — НЕ здоровайся повторно. Продолжай разговор естественно."

        messages = [{"role": "system", "content": enhanced_system}]
        for msg in messages_history:
            messages.append({
                "role": "user" if msg["role"] == "user" else "assistant",
                "content": msg["text"]
            })
        messages.append({"role": "user", "content": user_text})

        completion = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=1024,
        )

        response = completion.choices[0].message.content
        logger.info(f"OpenAI ответ [{self.model}] для чата {chat_id}: {response[:100]}...")
        return response

    async def _openai_image_response(self, chat_id, image_path, system_prompt, user_text):
        from openai import AsyncOpenAI

        key = self._get_key()
        client = AsyncOpenAI(api_key=key)

        # Read and encode image to base64
        with open(image_path, "rb") as f:
            image_data = f.read()

        mime_type = "image/jpeg"
        if image_path.endswith(".png"):
            mime_type = "image/png"
        elif image_path.endswith(".webp"):
            mime_type = "image/webp"

        b64_image = base64.b64encode(image_data).decode("utf-8")

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}"
                        }
                    }
                ]
            }
        ]

        completion = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=1024,
        )

        response = completion.choices[0].message.content
        logger.info(f"OpenAI анализ изображения [{self.model}] для чата {chat_id}: {response[:100]}...")
        return response

    # ── Groq ──────────────────────────────────────────────────

    async def _groq_response(self, chat_id, messages_history, system_prompt, user_text):
        from groq import AsyncGroq

        groq_client = AsyncGroq(api_key=self.api_key)

        enhanced_system = system_prompt + "\n\nВАЖНО: Если в истории диалога уже были приветствия — НЕ здоровайся повторно. Продолжай разговор естественно."

        messages = [{"role": "system", "content": enhanced_system}]
        for msg in messages_history:
            messages.append({
                "role": "user" if msg["role"] == "user" else "assistant",
                "content": msg["text"]
            })
        messages.append({"role": "user", "content": user_text})

        completion = await groq_client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=1024,
        )

        response = completion.choices[0].message.content
        logger.info(f"Groq ответ [{self.model}] для чата {chat_id}: {response[:100]}...")
        return response
