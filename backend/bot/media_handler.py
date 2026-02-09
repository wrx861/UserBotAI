import re
import logging
from pathlib import Path
from .config import BotConfig

logger = logging.getLogger(__name__)

MEDIA_EXTENSIONS = {
    "VIDEO": [".mp4", ".mov", ".avi", ".mkv"],
    "IMAGE": [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    "DOCUMENT": [".pdf", ".doc", ".docx", ".txt", ".zip"]
}

TAG_PATTERN = re.compile(r'\[(?:SEND_)?(VIDEO|IMAGE|DOCUMENT):([^\]]+)\]')


def parse_media_tags(text):
    """Extract media tags from AI response and return clean text + tags list."""
    tags = TAG_PATTERN.findall(text)
    clean_text = TAG_PATTERN.sub('', text).strip()
    # Remove double spaces and empty lines left after tag removal
    clean_text = re.sub(r'\n\s*\n', '\n', clean_text)
    clean_text = re.sub(r'  +', ' ', clean_text)
    return clean_text, tags


def find_media_file(tag):
    """Find a media file by tag name in the media directory."""
    media_dir = BotConfig.MEDIA_DIR
    if not media_dir.exists():
        logger.warning(f"Media directory not found: {media_dir}")
        return None, None

    for media_type, extensions in MEDIA_EXTENSIONS.items():
        for ext in extensions:
            filepath = media_dir / f"{tag}{ext}"
            if filepath.exists():
                return str(filepath), media_type

    logger.warning(f"Media file not found for tag: {tag}")
    return None, None


def list_media_files():
    """List all available media files in the media directory."""
    media_dir = BotConfig.MEDIA_DIR
    if not media_dir.exists():
        return []

    files = []
    for f in sorted(media_dir.iterdir()):
        if f.is_file() and not f.name.startswith('.') and f.suffix.lower() != '.md':
            tag = f.stem
            ext = f.suffix.lower()
            media_type = "UNKNOWN"
            for mt, exts in MEDIA_EXTENSIONS.items():
                if ext in exts:
                    media_type = mt
                    break
            files.append({
                "tag": tag,
                "filename": f.name,
                "media_type": media_type,
                "size_bytes": f.stat().st_size
            })
    return files
