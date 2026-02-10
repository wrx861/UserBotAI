<h1 align="center">Support AI UserBot</h1>

<p align="center">
  <b>Telegram User-Bot с AI для автоматической поддержки клиентов</b><br/>
  Веб-панель управления · Gemini / OpenAI / Groq · Голосовые сообщения · Обучение на переписке
</p>

<p align="center">
  <a href="https://github.com/wrx861/UserBotAI"><img src="https://img.shields.io/github/stars/wrx861/UserBotAI?style=social" /></a>
  <img src="https://img.shields.io/badge/python-3.11+-blue?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/fastapi-0.100+-009688?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

---

## Что умеет

| Функция | Описание |
|---------|----------|
| **AI-ответы** | Автоматические ответы через Gemini / OpenAI / Groq |
| **Анализ скриншотов** | AI распознаёт ошибки на фото и скриншотах |
| **Обучение на переписке** | Сканирует ваши чаты, копирует стиль общения |
| **Голосовые сообщения** | Распознавание (STT) и синтез речи (TTS) через ElevenLabs |
| **Медиа-шаблоны** | Авто-отправка видео/фото/документов по ключевым словам |
| **Режим тишины** | Замолкает на 30 мин когда вы отвечаете сами |
| **Веб-панель** | Полное управление через браузер |

---

## Требования

- **Сервер** — Ubuntu 20.04+ / Debian 11+ (VPS с 1+ ГБ RAM)
- **Docker** + **Docker Compose** (установятся автоматически)
- **Домен** с DNS A-записью на IP сервера
- **Telegram API** — API ID + Hash → [my.telegram.org](https://my.telegram.org)
- **AI ключ** — минимум один: [Gemini](https://aistudio.google.com/apikey) / [OpenAI](https://platform.openai.com/api-keys) / [Groq](https://console.groq.com/keys)

---

## Быстрый старт

### 1. DNS

Добавьте A-запись в DNS вашего домена:

| Тип | Имя | Значение | TTL |
|-----|-----|----------|-----|
| **A** | `ai` | `IP_ВАШЕГО_СЕРВЕРА` | 300 |

Проверка:
```bash
dig ai.example.com +short
```

### 2. Установка

```bash
bash <(curl -fLs https://raw.githubusercontent.com/wrx861/UserBotAI/main/install.sh)
```

Одна команда — скрипт сам клонирует репо, установит Docker, найдёт/получит SSL-сертификат и запустит все сервисы.

### 3. Настройка

Откройте `https://ai.example.com` и:

1. **Настройки** → Telegram API данные (ID, Hash, телефон)
2. **Настройки** → AI провайдер и API ключ
3. **Авторизация Telegram** → отправить код → ввести код
4. **Запустить бота** → готово!

---

## Установка с существующим Nginx

Если на сервере уже работает Nginx — не поднимайте контейнер `nginx` из docker-compose.

### 1. Порты в docker-compose.prod.yml

```yaml
backend:
  ports:
    - "127.0.0.1:8501:8001"

frontend:
  ports:
    - "127.0.0.1:3500:3000"
```

> Порты `8501`/`3500` — пример. Занят? Замените. Проверить: `ss -tlnp | grep 8501`

### 2. Конфиг Nginx

Создайте `/etc/nginx/sites-available/ai-bot.conf`:

```nginx
server {
    listen 80;
    server_name ai.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai.example.com;

    ssl_certificate     /etc/letsencrypt/live/ai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 50m;

    # API → Backend
    location /api/ {
        proxy_pass http://127.0.0.1:8501;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3500;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Активация

```bash
ln -s /etc/nginx/sites-available/ai-bot.conf /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 4. Запуск (без nginx)

```bash
docker compose -f docker-compose.prod.yml up -d mongo backend frontend
```

---

## Структура проекта

```
support-ai-bot/
├── backend/
│   ├── server.py              # API эндпоинты (FastAPI)
│   ├── bot/
│   │   ├── telegram_bot.py    # Pyrogram User-Bot
│   │   ├── gemini_client.py   # AI клиент (Gemini/OpenAI/Groq)
│   │   ├── voice_handler.py   # ElevenLabs STT/TTS
│   │   ├── database.py        # MongoDB
│   │   ├── media_handler.py   # Медиа-теги
│   │   ├── system_prompt.py   # Системный промпт
│   │   └── config.py          # Конфигурация
│   ├── media/                 # Медиа-файлы для отправки
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # Главный компонент
│   │   └── components/        # UI компоненты
│   └── package.json
│
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx/
│
├── ssl/                       # SSL-сертификаты
├── docker-compose.prod.yml
├── install.sh
└── README.md
```

---

## Переменные окружения

> Все настройки можно ввести через **веб-панель** → **Настройки** (рекомендуется).

| Переменная | Описание | Где получить |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API ключ | [aistudio.google.com](https://aistudio.google.com/apikey) |
| `TELEGRAM_API_ID` | Telegram API ID | [my.telegram.org](https://my.telegram.org) или веб-панель |
| `TELEGRAM_API_HASH` | Telegram API Hash | [my.telegram.org](https://my.telegram.org) или веб-панель |
| `TELEGRAM_PHONE` | Номер телефона Telegram | Веб-панель |
| `ADMIN_USER_ID` | ID админа (режим тишины) | [@userinfobot](https://t.me/userinfobot) |
| `ELEVENLABS_API_KEY` | ElevenLabs (голос) | [elevenlabs.io](https://elevenlabs.io) |
| `MONGO_URL` | MongoDB URI | По умолчанию: `mongodb://mongo:27017` |
| `DB_NAME` | Имя БД | По умолчанию: `support_ai_bot` |
| `CORS_ORIGINS` | Домен панели | `https://ai.example.com` |
| `SILENCE_DURATION_MIN` | Минуты тишины | По умолчанию: `30` |
| `HISTORY_LIMIT` | Сообщений в памяти | По умолчанию: `20` |

---

## AI провайдеры

| Провайдер | Рекомендуемая модель | Vision | Ключ |
|---|---|---|---|
| **Google Gemini** | `gemini-2.5-flash` | ✅ | [Получить](https://aistudio.google.com/apikey) |
| **OpenAI** | `gpt-4.1-mini` | ✅ | [Получить](https://platform.openai.com/api-keys) |
| **Groq** | `llama-3.3-70b-versatile` | ❌ | [Получить](https://console.groq.com/keys) |

<details>
<summary><b>Все модели (29 шт.)</b></summary>

### Google Gemini

| Модель | Vision | Контекст |
|--------|--------|----------|
| `gemini-3-flash-preview` | ✅ | 1M |
| `gemini-3-pro-preview` | ✅ | 1M |
| `gemini-2.5-flash` | ✅ | 1M |
| `gemini-2.5-flash-lite` | ✅ | 1M |
| `gemini-2.5-pro` | ✅ | 1M |
| `gemini-2.0-flash` | ✅ | 1M |
| `gemini-2.0-flash-lite` | ✅ | 1M |

### OpenAI

| Модель | Vision | Контекст |
|--------|--------|----------|
| `gpt-5.2` | ✅ | 400K |
| `gpt-5.1` | ✅ | 1M |
| `gpt-5` | ✅ | 1M |
| `gpt-4.1` | ✅ | 1M |
| `gpt-4.1-mini` | ✅ | 1M |
| `gpt-4.1-nano` | ✅ | 1M |
| `gpt-4o` | ✅ | 128K |
| `gpt-4o-mini` | ✅ | 128K |
| `o4-mini` | ✅ | 200K |
| `o3-mini` | ❌ | 200K |

### Groq

| Модель | Vision | Контекст |
|--------|--------|----------|
| `llama-3.3-70b-versatile` | ❌ | 128K |
| `llama-3.1-8b-instant` | ❌ | 128K |
| `llama-4-maverick-17b` | ✅ | 128K |
| `llama-4-scout-17b` | ✅ | 128K |
| `llama-3.2-90b-vision` | ✅ | 128K |
| `llama-3.2-11b-vision` | ✅ | 128K |
| `deepseek-r1-70b` | ❌ | 128K |
| `gpt-oss-120b` | ❌ | 128K |
| `gpt-oss-20b` | ❌ | 128K |
| `qwen3-32b` | ❌ | 128K |
| `kimi-k2` | ❌ | 256K |
| `mistral-saba-24b` | ❌ | 32K |

</details>

---

## Архитектура

```
┌─────────────────────────────────────────────┐
│                  Интернет                    │
│                    ↓                         │
│         DNS: ai.example.com → IP            │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│              Nginx (443/SSL)                 │
│  ┌─────────────────┬──────────────────────┐  │
│  │  /api/*         │  /*                  │  │
│  │  → backend:8001 │  → frontend:3000     │  │
│  └─────────────────┴──────────────────────┘  │
└───────┬────────────────────────┬─────────────┘
        │                        │
┌───────▼──────┐  ┌──────────────▼──────────┐
│   Backend    │  │       Frontend          │
│   FastAPI    │  │  React + Tailwind       │
│   :8001      │  │       :3000             │
└───────┬──────┘  └─────────────────────────┘
        │
┌───────▼──────┐  ┌─────────────────────────┐
│   MongoDB    │  │    Telegram API          │
│   :27017     │  │    (Pyrogram User-Bot)   │
└──────────────┘  └─────────────────────────┘
```

---

## Управление

```bash
# Статус
docker compose -f docker-compose.prod.yml ps

# Логи
docker compose -f docker-compose.prod.yml logs -f backend

# Перезапуск
docker compose -f docker-compose.prod.yml restart

# Пересборка
docker compose -f docker-compose.prod.yml up -d --build

# ⚡ ОБНОВЛЕНИЕ (рекомендуемый способ)
bash update.sh

# Обновление вручную (ВАЖНО: используйте docker-compose.prod.yml!)
git pull && docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d --build

# Бэкап MongoDB
docker compose -f docker-compose.prod.yml exec mongo mongodump --out /data/backup
docker cp support-bot-mongo:/data/backup ./backup_$(date +%Y%m%d)
```

> ⚠️ **ВАЖНО:** Всегда используйте `-f docker-compose.prod.yml` при работе с продакшеном!
> Команда `docker compose up` без `-f` использует другой файл и не запустит frontend.

---

## SSL-сертификат

Скрипт `install.sh` автоматически ищет сертификаты:

| Приоритет | Путь | Описание |
|---|------|----------|
| 1 | `./ssl/*.pem` | Ваши сертификаты в папке проекта |
| 2 | `/etc/letsencrypt/live/<домен>/` | Certbot (точное совпадение) |
| 3 | `/etc/letsencrypt/live/*/` | Wildcard |
| 4 | Let's Encrypt | Запрос нового |

```bash
# Свой сертификат (wildcard)
cp /path/to/fullchain.pem ssl/
cp /path/to/privkey.pem   ssl/
bash install.sh
```

---

## Устранение проблем

| Проблема | Решение |
|----------|---------|
| Контейнер не запускается | `docker compose -f docker-compose.prod.yml logs backend` |
| SSL не работает | `dig ai.example.com +short` → проверьте DNS |
| MongoDB не подключается | `docker compose -f docker-compose.prod.yml logs mongo` |
| Бот не отвечает | Проверьте статус в панели + AI ключ + логи backend |

---

## Лицензия

MIT License
