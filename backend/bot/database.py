import uuid
from datetime import datetime, timezone, timedelta


class BotDatabase:
    def __init__(self, db):
        self.db = db
        self.messages = db.messages
        self.silence_timers = db.silence_timers
        self.activity_log = db.activity_log
        self.bot_status = db.bot_status
        self.bot_config = db.bot_config
        self.media_templates = db.media_templates

    async def save_message(self, chat_id, role, text, username=None, has_image=False):
        doc = {
            "chat_id": str(chat_id),
            "role": role,
            "text": text or "",
            "username": username,
            "has_image": has_image,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.messages.insert_one(doc)

    async def get_history(self, chat_id, limit=20):
        messages = await self.messages.find(
            {"chat_id": str(chat_id)},
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit).to_list(limit)
        return list(reversed(messages))

    async def is_silenced(self, chat_id):
        now = datetime.now(timezone.utc).isoformat()
        timer = await self.silence_timers.find_one(
            {"chat_id": str(chat_id), "expires_at": {"$gt": now}},
            {"_id": 0}
        )
        return timer is not None

    async def activate_silence(self, chat_id, duration_min):
        expires = datetime.now(timezone.utc) + timedelta(minutes=duration_min)
        await self.silence_timers.update_one(
            {"chat_id": str(chat_id)},
            {"$set": {"expires_at": expires.isoformat()}},
            upsert=True
        )

    async def log_activity(self, event_type, chat_id=None, details="", username=None):
        await self.activity_log.insert_one({
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "chat_id": chat_id,
            "username": username,
            "details": details
        })

    async def update_bot_status(self, is_running, started_at=None):
        update = {"is_running": is_running}
        if started_at:
            update["started_at"] = started_at
        await self.bot_status.update_one(
            {"_id": "main"},
            {"$set": update},
            upsert=True
        )

    async def set_auth_state(self, state):
        """Track auth flow state: none, code_sent, authorized"""
        await self.bot_status.update_one(
            {"_id": "main"},
            {"$set": {"auth_state": state}},
            upsert=True
        )

    async def get_auth_state(self):
        doc = await self.bot_status.find_one({"_id": "main"}, {"_id": 0})
        return (doc or {}).get("auth_state", "none")

    async def get_bot_status(self):
        doc = await self.bot_status.find_one({"_id": "main"}, {"_id": 0})
        return doc or {"is_running": False}

    async def get_stats(self):
        total_messages = await self.messages.count_documents({})
        total_chats = len(await self.messages.distinct("chat_id"))
        total_images = await self.messages.count_documents({"has_image": True})
        total_media_sent = await self.activity_log.count_documents({"event_type": "media_sent"})
        now = datetime.now(timezone.utc).isoformat()
        silenced_count = await self.silence_timers.count_documents({"expires_at": {"$gt": now}})
        return {
            "total_messages": total_messages,
            "total_chats": total_chats,
            "total_images_analyzed": total_images,
            "total_media_sent": total_media_sent,
            "silenced_chats": silenced_count
        }
