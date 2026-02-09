import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')


class BotConfig:
    TELEGRAM_API_ID = os.environ.get('TELEGRAM_API_ID', '')
    TELEGRAM_API_HASH = os.environ.get('TELEGRAM_API_HASH', '')
    TELEGRAM_PHONE = os.environ.get('TELEGRAM_PHONE', '')
    ADMIN_USER_ID = int(os.environ.get('ADMIN_USER_ID') or '0')
    SILENCE_DURATION_MIN = int(os.environ.get('SILENCE_DURATION_MIN') or '30')
    HISTORY_LIMIT = int(os.environ.get('HISTORY_LIMIT') or '20')
    GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
    MEDIA_DIR = Path(__file__).parent.parent / 'media'

    @classmethod
    def has_telegram_creds(cls):
        return bool(cls.TELEGRAM_API_ID and cls.TELEGRAM_API_HASH)

    @classmethod
    def get_api_key(cls):
        return cls.GEMINI_API_KEY
