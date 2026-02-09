import os
import asyncio
import logging
import tempfile
import subprocess

logger = logging.getLogger(__name__)

_ffmpeg_checked = False


def _ensure_ffmpeg():
    """Install ffmpeg if not present (container may lose it on restart)."""
    global _ffmpeg_checked
    if _ffmpeg_checked:
        return
    import shutil
    if shutil.which("ffmpeg"):
        _ffmpeg_checked = True
        return
    logger.info("ffmpeg not found, installing...")
    try:
        subprocess.run(
            ["apt-get", "install", "-y", "-qq", "ffmpeg"],
            capture_output=True, timeout=60
        )
        _ffmpeg_checked = True
        logger.info("ffmpeg installed successfully")
    except Exception as e:
        logger.warning(f"Failed to install ffmpeg: {e}")

# ElevenLabs TTS model options
TTS_MODELS = {
    "eleven_v3": {
        "name": "Eleven v3 (новейший)",
        "description": "Самый выразительный, 70+ языков",
        "languages": "70+",
        "char_limit": 5000,
    },
    "eleven_multilingual_v2": {
        "name": "Multilingual v2",
        "description": "Стабильный, натуральный, 29 языков",
        "languages": "29",
        "char_limit": 10000,
    },
    "eleven_flash_v2_5": {
        "name": "Flash v2.5 (быстрый)",
        "description": "Ультра-быстрый ~75мс, 32 языка",
        "languages": "32",
        "char_limit": 40000,
    },
    "eleven_turbo_v2_5": {
        "name": "Turbo v2.5",
        "description": "Баланс качества и скорости, 32 языка",
        "languages": "32",
        "char_limit": 40000,
    },
}

# STT model options
STT_MODELS = {
    "scribe_v2": {
        "name": "Scribe v2 (лучший)",
        "description": "90+ языков, распознавание спикеров",
    },
    "scribe_v1": {
        "name": "Scribe v1",
        "description": "90+ языков, базовый",
    },
}

DEFAULT_TTS_MODEL = "eleven_multilingual_v2"
DEFAULT_STT_MODEL = "scribe_v2"
DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"  # Adam
DEFAULT_LANGUAGE = "ru"

# Supported languages for TTS
TTS_LANGUAGES = {
    "ru": "Русский",
    "en": "English",
    "auto": "Авто-определение",
}

PREVIEW_TEXT_RU = "Здравствуйте! Я ваш AI ассистент поддержки. Чем могу вам помочь сегодня?"


class VoiceHandler:
    """Handles voice message transcription (STT) and synthesis (TTS) via ElevenLabs."""

    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        self._client = None

    @property
    def is_configured(self):
        return bool(self.api_key)

    def update_key(self, new_key):
        """Update the API key and reset client."""
        self.api_key = new_key
        self._client = None

    def _get_client(self):
        if not self._client and self.api_key:
            from elevenlabs import ElevenLabs
            self._client = ElevenLabs(api_key=self.api_key)
        return self._client

    # ── Speech-to-Text ──────────────────────────────────────

    async def transcribe(self, audio_path: str, model_id: str = None) -> str:
        """Convert voice message to text using ElevenLabs STT."""
        if not self.is_configured:
            raise ValueError("ElevenLabs API key not configured")

        if not model_id:
            model_id = DEFAULT_STT_MODEL

        def _do_transcribe():
            client = self._get_client()
            with open(audio_path, "rb") as f:
                result = client.speech_to_text.convert(
                    file=f,
                    model_id=model_id,
                )
            return result.text if hasattr(result, 'text') else str(result)

        text = await asyncio.to_thread(_do_transcribe)
        logger.info(f"Transcribed voice ({model_id}): {text[:100]}...")
        return text

    # ── Text-to-Speech ──────────────────────────────────────

    async def synthesize(self, text: str, voice_id: str = None, model_id: str = None, language: str = None) -> str:
        """Convert text to voice using ElevenLabs TTS.
        Returns path to .ogg file ready for Telegram.
        """
        if not self.is_configured:
            raise ValueError("ElevenLabs API key not configured")

        if not voice_id:
            voice_id = DEFAULT_VOICE_ID
        if not model_id:
            model_id = DEFAULT_TTS_MODEL
        if not language:
            language = DEFAULT_LANGUAGE

        # Respect character limits
        model_info = TTS_MODELS.get(model_id, {})
        char_limit = model_info.get("char_limit", 5000)
        if len(text) > char_limit:
            text = text[:char_limit]

        def _do_synthesize():
            client = self._get_client()
            kwargs = {
                "text": text,
                "voice_id": voice_id,
                "model_id": model_id,
            }
            # Pass language_code only if not auto-detect
            if language and language != "auto":
                kwargs["language_code"] = language

            audio_generator = client.text_to_speech.convert(**kwargs)

            # Collect audio data (MP3)
            audio_data = b""
            for chunk in audio_generator:
                audio_data += chunk

            # Save as temp MP3
            mp3_fd, mp3_path = tempfile.mkstemp(suffix=".mp3")
            with os.fdopen(mp3_fd, "wb") as f:
                f.write(audio_data)

            # Ensure ffmpeg is available
            _ensure_ffmpeg()

            # Convert MP3 → OGG (Opus) for Telegram voice messages
            ogg_path = mp3_path.replace(".mp3", ".ogg")
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-i", mp3_path,
                        "-c:a", "libopus",
                        "-b:a", "64k",
                        "-ar", "48000",
                        "-ac", "1",
                        ogg_path,
                        "-y", "-loglevel", "error"
                    ],
                    check=True,
                    capture_output=True,
                    timeout=30
                )
            except (subprocess.CalledProcessError, FileNotFoundError) as e:
                logger.warning(f"ffmpeg conversion failed: {e}, sending MP3 directly")
                # Telegram can accept MP3 as voice too via send_audio
                # But try renaming to .ogg — Pyrogram/Telegram may still accept it
                ogg_path = mp3_path
            finally:
                if os.path.exists(ogg_path) and ogg_path != mp3_path:
                    os.remove(mp3_path)

            return ogg_path

        result_path = await asyncio.to_thread(_do_synthesize)
        logger.info(f"Synthesized voice ({model_id}): {len(text)} chars → {result_path}")
        return result_path

    # ── Get available voices ────────────────────────────────

    async def get_voices(self) -> list:
        """Get list of available ElevenLabs voices with preview URLs and descriptions."""
        if not self.is_configured:
            logger.warning("ElevenLabs не настроен - нет API ключа")
            return []

        def _do_get_voices():
            client = self._get_client()
            try:
                logger.info("Запрос списка голосов ElevenLabs...")
                response = client.voices.get_all()
                voices = []
                for v in response.voices:
                    # Extract labels dict
                    labels = {}
                    if hasattr(v, 'labels') and v.labels:
                        if isinstance(v.labels, dict):
                            labels = v.labels
                        else:
                            try:
                                labels = dict(v.labels)
                            except Exception:
                                labels = {}

                    voices.append({
                        "voice_id": v.voice_id,
                        "name": v.name,
                        "category": getattr(v, 'category', 'unknown'),
                        "preview_url": getattr(v, 'preview_url', None) or "",
                        "description": getattr(v, 'description', None) or "",
                        "labels": labels,
                    })
                logger.info(f"Получено {len(voices)} голосов ElevenLabs")
                return voices
            except Exception as e:
                error_str = str(e).lower()
                if "401" in str(e) or "unauthorized" in error_str or "invalid" in error_str:
                    logger.error(f"ElevenLabs: Невалидный API ключ: {e}")
                elif "403" in str(e) or "forbidden" in error_str:
                    logger.error(f"ElevenLabs: Доступ запрещён: {e}")
                else:
                    logger.error(f"ElevenLabs: Ошибка получения голосов: {e}")
                return []

        return await asyncio.to_thread(_do_get_voices)

    # ── Generate Russian voice preview ──────────────────────

    async def generate_preview(self, voice_id: str, cache_dir: str) -> str:
        """Generate a short Russian TTS preview for a voice. Caches result as MP3.
        Returns path to cached MP3 file, or empty string on failure.
        """
        if not self.is_configured:
            raise ValueError("ElevenLabs API key not configured")

        # Check cache first
        cache_path = os.path.join(cache_dir, f"preview_{voice_id}.mp3")
        if os.path.exists(cache_path) and os.path.getsize(cache_path) > 100:
            return cache_path

        def _do_generate():
            client = self._get_client()
            audio_generator = client.text_to_speech.convert(
                text=PREVIEW_TEXT_RU,
                voice_id=voice_id,
                model_id="eleven_flash_v2_5",  # Fast model for previews
                language_code="ru",
            )
            audio_data = b""
            for chunk in audio_generator:
                audio_data += chunk

            os.makedirs(cache_dir, exist_ok=True)
            with open(cache_path, "wb") as f:
                f.write(audio_data)
            return cache_path

        result = await asyncio.to_thread(_do_generate)
        logger.info(f"Generated Russian preview for voice {voice_id}: {result}")
        return result


# Global instance
_voice_handler = None


def get_voice_handler() -> VoiceHandler:
    global _voice_handler
    if _voice_handler is None:
        _voice_handler = VoiceHandler()
    return _voice_handler


def reset_voice_handler():
    """Reset the global handler (e.g. when API key changes)."""
    global _voice_handler
    _voice_handler = None
