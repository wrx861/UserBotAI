import asyncio
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import BotConfig
from .database import BotDatabase
from .gemini_client import AIClient
from .media_handler import parse_media_tags, find_media_file, list_media_files
from .system_prompt import SYSTEM_PROMPT
from .voice_handler import get_voice_handler

logger = logging.getLogger(__name__)


class SupportAIBot:
    def __init__(self, db_instance):
        self.database = BotDatabase(db_instance)
        self.admin_id = BotConfig.ADMIN_USER_ID
        self.silence_duration = BotConfig.SILENCE_DURATION_MIN
        self.history_limit = BotConfig.HISTORY_LIMIT
        self.app = None
        self._running = False
        self._phone_code_hash = None
        self._api_id = BotConfig.TELEGRAM_API_ID
        self._api_hash = BotConfig.TELEGRAM_API_HASH
        self._db_instance = db_instance

    def set_creds(self, api_id, api_hash):
        self._api_id = str(api_id)
        self._api_hash = str(api_hash)

    def _get_system_prompt(self):
        # This is a sync fallback, the async version in server.py is preferred
        media_files = list_media_files()
        if media_files:
            templates_str = "\n".join(
                f"- [{m['media_type']}:{m['tag']}] — {m['filename']}"
                for m in media_files
            )
        else:
            templates_str = "Медиа-шаблоны отсутствуют."
        return SYSTEM_PROMPT.format(media_templates=templates_str)

    async def _get_ai_client(self):
        """Создать AI клиент из текущих настроек в БД."""
        doc = await self._db_instance.ai_settings.find_one({"_id": "main"}, {"_id": 0})
        gemini_key = os.environ.get("GEMINI_API_KEY", "")
        if not doc:
            return AIClient(provider="gemini", model="gemini-2.0-flash", api_key=gemini_key)

        provider = doc.get("provider", "gemini")
        model = doc.get("model", "gemini-2.0-flash")
        api_keys = doc.get("api_keys", {})

        # Ключ для выбранного провайдера
        api_key = api_keys.get(provider, "")
        # Фолбэк на ключ из .env для gemini
        if not api_key and provider == "gemini":
            api_key = gemini_key

        return AIClient(provider=provider, model=model, api_key=api_key)

    async def _get_temperature(self):
        """Получить температуру AI из конфига."""
        doc = await self._db_instance.bot_config.find_one({"_id": "main"}, {"_id": 0})
        if doc:
            return doc.get("temperature", 0.7)
        return 0.7

    async def _get_voice_settings(self):
        """Get voice settings from DB."""
        doc = await self._db_instance.voice_settings.find_one({"_id": "main"}, {"_id": 0})
        if not doc:
            return {
                "voice_enabled": False,
                "voice_id": "pNInz6obpgDQGcFmaJgB",
                "tts_model": "eleven_multilingual_v2",
                "stt_model": "scribe_v2",
            }
        # Ensure handler has the right key
        stored_key = doc.get("elevenlabs_api_key", "")
        env_key = os.environ.get("ELEVENLABS_API_KEY", "")
        active_key = stored_key or env_key
        if active_key:
            handler = get_voice_handler()
            if handler.api_key != active_key:
                handler.update_key(active_key)
        return doc

    async def _get_system_prompt_async(self):
        """Build system prompt using custom prompt from DB if available."""
        custom_doc = await self.database.db.custom_prompt.find_one({"_id": "main"}, {"_id": 0})
        custom_prompt = custom_doc.get("prompt", "") if custom_doc else ""

        media_files = list_media_files()
        rules = {}
        async for r in self.database.db.media_rules.find({}, {"_id": 0}):
            rules[r["tag"]] = r["description"]

        if media_files:
            templates_str = "\n".join(
                f"- [{m['media_type']}:{m['tag']}] — {m['filename']}"
                + (f" — Когда отправлять: {rules[m['tag']]}" if m['tag'] in rules else "")
                for m in media_files
            )
        else:
            templates_str = "Медиа-шаблоны отсутствуют."

        # Get style profile and few-shot examples from training data
        style_doc = await self.database.db.style_profile.find_one({"_id": "main"}, {"_id": 0})
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

    def _create_client(self):
        from pyrogram import Client
        self.app = Client(
            "support_ai_bot",
            api_id=int(self._api_id),
            api_hash=self._api_hash,
            workdir=str(Path(__file__).parent.parent)
        )

    def _register_handlers(self):
        from pyrogram import filters

        @self.app.on_message(filters.private & filters.incoming)
        async def handle_incoming(client, message):
            await self._on_user_message(message)

        @self.app.on_message(filters.private & filters.outgoing)
        async def handle_outgoing(client, message):
            await self._on_admin_message(message)

    async def check_session_valid(self):
        """Check if an existing session file is valid and can auto-login."""
        session_path = Path(__file__).parent.parent / "support_ai_bot.session"
        if not session_path.exists():
            return False
        try:
            self._create_client()
            await self.app.connect()
            me = await self.app.get_me()
            if me:
                logger.info(f"Session valid, logged in as {me.first_name} (@{me.username})")
                await self.app.disconnect()
                return True
        except Exception as e:
            logger.warning(f"Session check failed: {e}")
            if self.app:
                try:
                    await self.app.disconnect()
                except Exception:
                    pass
        return False

    async def send_auth_code(self, phone_number):
        """Step 1: Send auth code to phone."""
        # Disconnect existing client if any
        if self.app:
            try:
                await self.app.disconnect()
            except Exception:
                pass
            self.app = None

        self._create_client()
        await self.app.connect()
        sent_code = await self.app.send_code(phone_number)
        self._phone_code_hash = sent_code.phone_code_hash

        # Persist phone_code_hash in DB so it survives server restarts
        await self._db_instance.bot_status.update_one(
            {"_id": "main"},
            {"$set": {
                "phone_code_hash": sent_code.phone_code_hash,
                "auth_phone": phone_number
            }},
            upsert=True
        )

        logger.info(f"Auth code sent to {phone_number}")
        return {"status": "code_sent", "phone_code_hash": sent_code.phone_code_hash}

    async def verify_auth_code(self, phone_number, code):
        """Step 2: Verify the auth code."""
        # Try to recover phone_code_hash from DB if lost (e.g. server restart)
        if not self._phone_code_hash:
            doc = await self._db_instance.bot_status.find_one({"_id": "main"}, {"_id": 0})
            if doc:
                self._phone_code_hash = doc.get("phone_code_hash")

        if not self._phone_code_hash:
            raise ValueError("Сначала отправьте код. Нажмите 'Отправить код' ещё раз.")

        # Reconnect client if needed
        if not self.app:
            self._create_client()
            await self.app.connect()
        elif not self.app.is_connected:
            try:
                await self.app.connect()
            except Exception:
                self._create_client()
                await self.app.connect()

        try:
            user = await self.app.sign_in(phone_number, self._phone_code_hash, code)
            await self.app.disconnect()
            # Clean up auth state from DB
            await self._db_instance.bot_status.update_one(
                {"_id": "main"},
                {"$unset": {"phone_code_hash": "", "auth_phone": ""}}
            )
            logger.info(f"Auth successful: {user.first_name}")
            return {"status": "authorized", "user": user.first_name}
        except Exception as e:
            error_str = str(e)
            if "PASSWORD" in error_str.upper() or "2FA" in error_str.upper() or "TWO_STEP" in error_str.upper():
                return {"status": "2fa_required"}
            logger.error(f"Auth failed: {e}")
            try:
                await self.app.disconnect()
            except Exception:
                pass
            raise

    async def verify_2fa(self, password):
        """Step 3: Verify 2FA password."""
        if not self.app:
            self._create_client()
            await self.app.connect()
        elif not self.app.is_connected:
            try:
                await self.app.connect()
            except Exception:
                self._create_client()
                await self.app.connect()
        try:
            user = await self.app.check_password(password)
            await self.app.disconnect()
            logger.info(f"2FA auth successful: {user.first_name}")
            return {"status": "authorized", "user": user.first_name}
        except Exception as e:
            logger.error(f"2FA failed: {e}")
            await self.app.disconnect()
            raise

    async def start_listening(self):
        """Start the bot after successful auth."""
        self._create_client()
        self._register_handlers()

        await self.database.update_bot_status(
            is_running=True,
            started_at=datetime.now(timezone.utc).isoformat()
        )
        await self.database.log_activity("bot_started", details="Support AI бот запущен")

        logger.info("Starting Pyrogram client with existing session...")
        await self.app.start()
        self._running = True

        me = await self.app.get_me()
        self._my_id = me.id
        logger.info(f"Bot running as {me.first_name} (@{me.username}), ID: {me.id}")

        try:
            while self._running:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        finally:
            await self.app.stop()
            await self.database.update_bot_status(is_running=False)
            await self.database.log_activity("bot_stopped", details="Support AI бот остановлен")
            self._running = False
            logger.info("Bot stopped")

    async def scan_dialogs(self, max_chats=50, messages_per_chat=100):
        """Scan existing Telegram dialogs and extract training data from admin's responses."""
        if not self.app or not self._running:
            raise ValueError("Бот должен быть запущен для сканирования")

        me = await self.app.get_me()
        my_id = me.id
        training_examples = []
        scanned_chats = 0
        total_messages = 0
        skipped_chats = 0

        await self.database.log_activity(
            "scan_started", details=f"Сканирование личных диалогов (до {max_chats} чатов)"
        )

        async for dialog in self.app.get_dialogs(limit=max_chats * 3):
            # ONLY private (personal) chats — skip groups, channels, bots
            if dialog.chat.type.value != "private":
                skipped_chats += 1
                continue
            if dialog.chat.id == my_id:
                continue
            # Skip bots
            if getattr(dialog.chat, 'is_bot', False):
                skipped_chats += 1
                continue

            if scanned_chats >= max_chats:
                break

            chat_id = dialog.chat.id
            username = dialog.chat.username or ""
            first_name = dialog.chat.first_name or ""
            pair_buffer = []

            try:
                messages_list = []
                async for msg in self.app.get_chat_history(chat_id, limit=messages_per_chat):
                    if msg.text:
                        messages_list.append(msg)

                # Reverse to chronological order
                messages_list.reverse()

                # Extract conversation pairs with context
                # Support multi-message admin responses (admin sends 2-3 msgs in a row)
                i = 0
                while i < len(messages_list) - 1:
                    curr = messages_list[i]
                    is_user_msg = curr.from_user and curr.from_user.id != my_id

                    if is_user_msg and curr.text:
                        # Collect user's message(s) — could be multiple in a row
                        user_texts = [curr.text]
                        j = i + 1
                        while j < len(messages_list):
                            nxt = messages_list[j]
                            if nxt.from_user and nxt.from_user.id != my_id and nxt.text:
                                user_texts.append(nxt.text)
                                j += 1
                            else:
                                break

                        # Now collect admin's response(s) — could be multiple in a row
                        admin_texts = []
                        while j < len(messages_list):
                            nxt = messages_list[j]
                            if nxt.from_user and nxt.from_user.id == my_id and nxt.text:
                                admin_texts.append(nxt.text)
                                j += 1
                            else:
                                break

                        if admin_texts:
                            pair_buffer.append({
                                "user": "\n".join(user_texts),
                                "admin": "\n".join(admin_texts)
                            })
                            total_messages += len(user_texts) + len(admin_texts)

                        i = j
                    else:
                        i += 1

                if pair_buffer:
                    training_examples.append({
                        "chat_id": str(chat_id),
                        "username": username,
                        "first_name": first_name,
                        "pairs": pair_buffer
                    })
                    scanned_chats += 1

            except Exception as e:
                logger.warning(f"Ошибка сканирования чата {chat_id}: {e}")
                continue

        # Store training data in MongoDB
        await self._db_instance.training_data.delete_many({})

        # Save all pairs as flat documents
        all_pairs = []
        for example in training_examples:
            for pair in example["pairs"]:
                all_pairs.append({
                    "user_message": pair["user"],
                    "admin_response": pair["admin"],
                    "chat_id": example["chat_id"],
                    "username": example["username"]
                })

        if all_pairs:
            await self._db_instance.training_data.insert_many(all_pairs)

        # Build style profile — use AI if possible, fallback to basic analysis
        style_profile = await self._analyze_style_with_ai(all_pairs)

        # Select best few-shot examples for the system prompt
        few_shot_examples = self._select_few_shot_examples(all_pairs, max_count=25)

        await self._db_instance.style_profile.update_one(
            {"_id": "main"},
            {"$set": {
                "profile": style_profile,
                "few_shot_examples": few_shot_examples,
                "total_examples": len(all_pairs),
                "scanned_chats": scanned_chats,
                "scanned_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

        await self.database.log_activity(
            "scan_completed",
            details=f"Просканировано {scanned_chats} личных чатов, {len(all_pairs)} пар сообщений, пропущено {skipped_chats} не-личных"
        )

        logger.info(f"Scan complete: {scanned_chats} private chats, {len(all_pairs)} pairs, skipped {skipped_chats}")
        return {
            "scanned_chats": scanned_chats,
            "total_pairs": len(all_pairs),
            "total_messages": total_messages,
            "skipped_non_private": skipped_chats,
            "style_profile": style_profile,
            "few_shot_count": len(few_shot_examples)
        }

    async def _analyze_style_with_ai(self, all_pairs):
        """Use AI to deeply analyze the admin's communication style."""
        if not all_pairs:
            return ""

        try:
            ai_client = await self._get_ai_client()

            # Select a diverse sample of pairs for analysis (up to 60)
            sample = self._select_diverse_pairs(all_pairs, max_count=60)

            # Format conversation pairs for AI analysis
            conversations_text = ""
            for i, pair in enumerate(sample, 1):
                conversations_text += f"--- Диалог {i} ---\n"
                conversations_text += f"Клиент: {pair['user_message']}\n"
                conversations_text += f"Оператор: {pair['admin_response']}\n\n"

            analysis_prompt = (
                "Ты — эксперт по анализу коммуникации. Проанализируй стиль общения оператора поддержки "
                "на основе его реальных ответов клиентам.\n\n"
                "Создай ДЕТАЛЬНЫЙ профиль стиля общения. Включи:\n\n"
                "1. ТОНАЛЬНОСТЬ: формальный/неформальный/дружеский/деловой, эмоциональность\n"
                "2. ПРИВЕТСТВИЯ: как начинает разговор, какие формы использует\n"
                "3. ПРОЩАНИЯ: как заканчивает разговор\n"
                "4. ХАРАКТЕРНЫЕ ФРАЗЫ: типичные выражения, обороты, слова-паразиты\n"
                "5. ЭМОДЗИ И СИМВОЛЫ: использует ли, какие, как часто\n"
                "6. ДЛИНА ОТВЕТОВ: короткие/средние/длинные, склонность к деталям\n"
                "7. СТРУКТУРА ОТВЕТОВ: использует ли списки, шаги, абзацы\n"
                "8. РЕАКЦИЯ НА ПРОБЛЕМЫ: как реагирует на жалобы, ошибки, сложные вопросы\n"
                "9. УНИКАЛЬНЫЕ ОСОБЕННОСТИ: что отличает этот стиль от обычного\n"
                "10. ЯЗЫК: какой язык использует (русский, английский, миксованный)\n\n"
                "Формат ответа — чёткие инструкции для AI, который будет ПОДРАЖАТЬ этому стилю.\n"
                "НЕ пиши примеры диалогов, только инструкции по стилю.\n"
                "Пиши кратко и по делу, максимум 500 слов."
            )

            response = await ai_client.get_response(
                "style_analysis_session",
                [],
                analysis_prompt,
                f"Вот {len(sample)} примеров реальных диалогов оператора с клиентами:\n\n{conversations_text}"
            )

            logger.info(f"AI style analysis complete: {len(response)} chars")
            return response

        except Exception as e:
            logger.warning(f"AI style analysis failed, using basic fallback: {e}")
            # Fallback to basic analysis
            admin_responses = [p["admin_response"] for p in all_pairs]
            return self._analyze_style_basic(admin_responses)

    def _select_diverse_pairs(self, pairs, max_count=60):
        """Select diverse representative conversation pairs."""
        if not pairs:
            return []

        # Filter quality pairs (not too short, not too long)
        good_pairs = [
            p for p in pairs
            if 5 < len(p.get("admin_response", "")) < 1500
            and len(p.get("user_message", "")) > 2
        ]

        if not good_pairs:
            good_pairs = pairs

        if len(good_pairs) <= max_count:
            return good_pairs

        import random
        random.seed(42)  # Reproducible selection

        # Sort by response length to get diverse lengths
        sorted_by_len = sorted(good_pairs, key=lambda p: len(p["admin_response"]))

        # Take evenly spaced samples across all lengths
        step = max(1, len(sorted_by_len) // max_count)
        selected = sorted_by_len[::step][:max_count]

        # Ensure we have some short, medium and long responses
        if len(selected) < max_count:
            remaining = [p for p in good_pairs if p not in selected]
            random.shuffle(remaining)
            selected.extend(remaining[:max_count - len(selected)])

        return selected[:max_count]

    def _select_few_shot_examples(self, all_pairs, max_count=25):
        """Select the best conversation examples for few-shot prompting."""
        if not all_pairs:
            return []

        # Filter good quality pairs
        good_pairs = [
            p for p in all_pairs
            if 20 < len(p.get("admin_response", "")) < 600
            and 5 < len(p.get("user_message", "")) < 300
        ]

        if not good_pairs:
            good_pairs = [p for p in all_pairs if len(p.get("admin_response", "")) > 10]

        if len(good_pairs) <= max_count:
            return [{"user": p["user_message"], "admin": p["admin_response"]} for p in good_pairs]

        import random
        random.seed(42)

        # Deduplicate similar responses (keep unique ones)
        seen_starts = set()
        unique_pairs = []
        for p in good_pairs:
            start = p["admin_response"][:40].lower().strip()
            if start not in seen_starts:
                seen_starts.add(start)
                unique_pairs.append(p)

        # Sort by diversity of response length
        unique_pairs.sort(key=lambda p: len(p["admin_response"]))

        # Take evenly spaced samples
        step = max(1, len(unique_pairs) // max_count)
        selected = unique_pairs[::step][:max_count]

        return [{"user": p["user_message"], "admin": p["admin_response"]} for p in selected]

    def _analyze_style_basic(self, responses):
        """Basic fallback style analysis without AI."""
        if not responses:
            return ""

        avg_len = sum(len(r) for r in responses) / len(responses)
        uses_emoji = any(any(ord(c) > 0x1F600 for c in r) for r in responses[:50])
        uses_informal = any(word in " ".join(responses[:50]).lower()
                          for word in ["бро", "братан", "чел", "го", "норм", "кста", "братуха", "ахах"])
        uses_formal = any(word in " ".join(responses[:50]).lower()
                         for word in ["уважаемый", "обращаем ваше внимание", "рады сообщить"])

        good_examples = [r for r in responses if 20 < len(r) < 500]
        sample = good_examples[:15] if len(good_examples) > 15 else good_examples

        style_parts = []
        style_parts.append(f"Средняя длина ответа: ~{int(avg_len)} символов.")

        if uses_informal:
            style_parts.append("Стиль: неформальный, дружеский, можно использовать сленг.")
        elif uses_formal:
            style_parts.append("Стиль: формальный, вежливый, деловой.")
        else:
            style_parts.append("Стиль: нейтральный, дружелюбный.")

        if uses_emoji:
            style_parts.append("Можно использовать эмодзи.")
        else:
            style_parts.append("Эмодзи не используются.")

        profile = " ".join(style_parts)

        if sample:
            profile += "\n\nПРИМЕРЫ РЕАЛЬНЫХ ОТВЕТОВ ОПЕРАТОРА (подражай этому стилю):\n"
            for i, ex in enumerate(sample, 1):
                profile += f'{i}. "{ex}"\n'

        return profile

    async def _on_user_message(self, message):
        chat_id = message.chat.id
        username = message.from_user.username if message.from_user else None
        is_voice_input = False

        if await self.database.is_silenced(chat_id):
            logger.info(f"Чат {chat_id} заглушен, пропуск")
            return

        # Определяем будет ли голосовой ответ (для правильного статуса)
        from pyrogram import enums
        voice_settings_pre = await self._get_voice_settings()
        is_voice_input = bool(message.voice or message.audio)
        voice_mode = voice_settings_pre.get("voice_mode", "voice_only")
        will_send_voice = (
            voice_settings_pre.get("voice_enabled", False)
            and (voice_mode == "always" or (voice_mode == "voice_only" and is_voice_input))
        )

        # Сразу показываем правильный статус
        if will_send_voice:
            await self.app.send_chat_action(chat_id, enums.ChatAction.RECORD_AUDIO)
        else:
            await self.app.send_chat_action(chat_id, enums.ChatAction.TYPING)

        system_prompt = await self._get_system_prompt_async()
        ai_client = await self._get_ai_client()
        ai_client.temperature = await self._get_temperature()
        voice_settings = voice_settings_pre

        try:
            # ── Обработка голосовых сообщений ───────────────────────
            if message.voice or message.audio:
                is_voice_input = True
                voice_path = await message.download()

                # Transcribe voice to text
                voice_handler = get_voice_handler()
                if voice_handler.is_configured:
                    try:
                        stt_model = voice_settings.get("stt_model", "scribe_v2")
                        transcribed_text = await voice_handler.transcribe(voice_path, model_id=stt_model)
                        user_text = transcribed_text or "[голосовое сообщение — не удалось распознать]"
                    except Exception as e:
                        logger.warning(f"Voice transcription failed: {e}")
                        user_text = "[голосовое сообщение — ошибка распознавания]"
                else:
                    user_text = "[голосовое сообщение — распознавание не настроено]"

                await self.database.save_message(chat_id, "user", user_text, username)
                await self.database.log_activity(
                    "voice_received", str(chat_id),
                    f"Голосовое: {user_text[:80]}", username
                )

                if os.path.exists(voice_path):
                    os.remove(voice_path)

                # Обновляем статус пока AI думает
                if will_send_voice:
                    await self.app.send_chat_action(chat_id, enums.ChatAction.RECORD_AUDIO)
                else:
                    await self.app.send_chat_action(chat_id, enums.ChatAction.TYPING)

                history = await self.database.get_history(chat_id, self.history_limit)
                response = await ai_client.get_response(
                    str(chat_id), history, system_prompt, user_text
                )

            # ── Обработка фото ───────────────────────
            elif message.photo:
                photo_path = await message.download()
                await self.database.save_message(
                    chat_id, "user", message.caption or "[скриншот]", username, has_image=True
                )
                await self.database.log_activity(
                    "message_received", str(chat_id), "Скриншот получен", username
                )

                if will_send_voice:
                    await self.app.send_chat_action(chat_id, enums.ChatAction.RECORD_AUDIO)
                else:
                    await self.app.send_chat_action(chat_id, enums.ChatAction.TYPING)

                history = await self.database.get_history(chat_id, self.history_limit)
                response = await ai_client.analyze_image(
                    str(chat_id), photo_path, system_prompt,
                    message.caption or "Пользователь отправил скриншот. Проанализируй и помоги."
                )

                if os.path.exists(photo_path):
                    os.remove(photo_path)

                await self.database.log_activity(
                    "image_analyzed", str(chat_id), "Скриншот проанализирован", username
                )

            # ── Обработка текстовых сообщений ────────────────────────
            else:
                text = message.text or ""
                await self.database.save_message(chat_id, "user", text, username)
                await self.database.log_activity(
                    "message_received", str(chat_id),
                    f"{text[:80]}" if text else "Пустое сообщение", username
                )

                await self.app.send_chat_action(chat_id, enums.ChatAction.TYPING if not will_send_voice else enums.ChatAction.RECORD_AUDIO)

                history = await self.database.get_history(chat_id, self.history_limit)
                response = await ai_client.get_response(
                    str(chat_id), history, system_prompt, text
                )

            clean_response, media_tags = parse_media_tags(response)

            if clean_response:
                if will_send_voice:
                    # Для голосовых — без задержки, сразу генерируем
                    await self.app.send_chat_action(chat_id, enums.ChatAction.RECORD_AUDIO)
                else:
                    # Для текста — имитация печатания
                    typing_delay = min(max(len(clean_response) / 40, 1.5), 8)
                    await self.app.send_chat_action(chat_id, enums.ChatAction.TYPING)
                    await asyncio.sleep(typing_delay)

                # ── Отправка голосом если включено ────────────────
                voice_sent = False
                voice_mode = voice_settings.get("voice_mode", "voice_only")
                should_send_voice = (
                    voice_settings.get("voice_enabled", False)
                    and (voice_mode == "always" or (voice_mode == "voice_only" and is_voice_input))
                )
                if should_send_voice:
                    voice_handler = get_voice_handler()
                    if voice_handler.is_configured:
                        try:
                            voice_id = voice_settings.get("voice_id", "pNInz6obpgDQGcFmaJgB")
                            tts_model = voice_settings.get("tts_model", "eleven_multilingual_v2")
                            tts_language = voice_settings.get("language", "ru")
                            await self.app.send_chat_action(chat_id, enums.ChatAction.RECORD_AUDIO)
                            audio_path = await voice_handler.synthesize(
                                clean_response, voice_id, model_id=tts_model, language=tts_language
                            )
                            if audio_path.endswith(".ogg"):
                                await self.app.send_voice(chat_id, audio_path)
                            else:
                                # MP3 fallback — send as audio file
                                await self.app.send_audio(chat_id, audio_path)
                            voice_sent = True
                            # Clean up temp file
                            if os.path.exists(audio_path):
                                os.remove(audio_path)
                            await self.database.log_activity(
                                "voice_sent", str(chat_id),
                                f"Голосовой ответ: {clean_response[:60]}", username
                            )
                        except Exception as e:
                            logger.warning(f"Voice synthesis failed, falling back to text: {e}")

                # Send text (always for text messages, or as fallback if voice failed)
                if not voice_sent:
                    await message.reply_text(clean_response)

                await self.database.save_message(chat_id, "assistant", clean_response)
                await self.database.log_activity(
                    "response_sent", str(chat_id),
                    f"{clean_response[:80]}", username
                )

            for media_type, tag in media_tags:
                filepath, detected_type = find_media_file(tag)
                if filepath:
                    if detected_type == "VIDEO":
                        await self.app.send_chat_action(chat_id, enums.ChatAction.UPLOAD_VIDEO)
                        await self.app.send_video(chat_id, filepath)
                    elif detected_type == "IMAGE":
                        await self.app.send_chat_action(chat_id, enums.ChatAction.UPLOAD_PHOTO)
                        await self.app.send_photo(chat_id, filepath)
                    else:
                        await self.app.send_chat_action(chat_id, enums.ChatAction.UPLOAD_DOCUMENT)
                        await self.app.send_document(chat_id, filepath)
                    await self.database.log_activity(
                        "media_sent", str(chat_id), f"Отправлено {media_type}: {tag}", username
                    )
                else:
                    logger.warning(f"Медиа файл не найден: {tag}")
        except Exception as e:
            logger.error(f"Ошибка обработки сообщения от {chat_id}: {e}")
            # Send error message to user so they don't wait forever
            try:
                error_msg = str(e)
                if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                    await message.reply_text(
                        "⏳ Извините, AI временно перегружен. Попробуйте через минуту."
                    )
                else:
                    await message.reply_text(
                        "⚠️ Произошла ошибка при обработке сообщения. Попробуйте позже."
                    )
            except Exception:
                pass

    async def _on_admin_message(self, message):
        chat_id = message.chat.id
        if chat_id != self.admin_id:
            # Read current silence duration from DB config (not cached value)
            config_doc = await self._db_instance.bot_config.find_one({"_id": "main"}, {"_id": 0})
            silence_min = (config_doc.get("silence_duration_min", self.silence_duration)
                          if config_doc else self.silence_duration)

            await self.database.activate_silence(chat_id, silence_min)
            await self.database.log_activity(
                "silence_activated", str(chat_id),
                f"Админ пишет — тишина на {silence_min} мин"
            )
            logger.info(f"Тишина активирована для чата {chat_id} на {silence_min} мин")


# Global bot instance
_bot_instance = None


def get_bot(db_instance):
    global _bot_instance
    if _bot_instance is None:
        _bot_instance = SupportAIBot(db_instance)
    return _bot_instance


async def start_bot(db_instance):
    bot = get_bot(db_instance)
    await bot.start_listening()
