#!/bin/bash
set -e

# ============================================
#  Support AI Bot — Установка на сервер
#  Ubuntu 20.04+ / Debian 11+
#  
#  Установка одной командой:
#  bash <(curl -fLs https://raw.githubusercontent.com/wrx861/UserBotAI/main/install.sh)
# ============================================

REPO_URL="https://github.com/wrx861/UserBotAI.git"
INSTALL_DIR="/opt/support-ai-bot"

BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

print_step() { echo -e "\n${BLUE}▸ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }

# ── Проверки ────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    print_err "Запустите скрипт от root"
    exit 1
fi

# ── Клонирование / обновление репозитория ────────────────
if [ ! -d "$INSTALL_DIR/.git" ]; then
    print_step "Клонирование репозитория..."
    apt-get update -qq && apt-get install -y -qq git >/dev/null 2>&1 || true
    git clone "$REPO_URL" "$INSTALL_DIR"
    print_ok "Репозиторий клонирован в $INSTALL_DIR"
else
    print_step "Обновление репозитория..."
    cd "$INSTALL_DIR" && git pull --ff-only 2>/dev/null || true
    print_ok "Репозиторий обновлён"
fi

cd "$INSTALL_DIR"

# ── Ввод данных ─────────────────────────────────────────
echo -e "\n${GREEN}╔══════════════════════════════════════════╗"
echo -e "║   Support AI Bot — Установка             ║"
echo -e "╚══════════════════════════════════════════╝${NC}\n"

read -p "Введите домен (например ai.example.com): " DOMAIN
read -p "Введите email (для SSL / уведомлений): " EMAIL

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    print_err "Домен и email обязательны!"
    exit 1
fi

# ── Проверка домена на не-ASCII символы (кириллица и т.д.) ──
if echo "$DOMAIN" | grep -P '[^\x00-\x7F]' >/dev/null 2>&1; then
    print_err "Домен содержит не-ASCII символы (кириллица и т.д.)!"
    print_warn "Let's Encrypt не поддерживает кириллические домены напрямую."
    print_warn "Используйте Punycode-версию домена. Например:"
    print_warn "  бот.example.com → xn--e1afkbacg6d.example.com"
    print_warn ""
    print_warn "Конвертировать: https://www.punycoder.com/"
    echo ""
    read -p "Введите Punycode-версию домена (или Enter для выхода): " PUNY_DOMAIN
    if [ -z "$PUNY_DOMAIN" ]; then
        exit 1
    fi
    DOMAIN="$PUNY_DOMAIN"
    print_ok "Используем Punycode домен: $DOMAIN"
fi

echo ""
print_warn "Домен: $DOMAIN"
print_warn "Email: $EMAIL"
echo ""
read -p "Всё верно? (y/n): " CONFIRM
[ "$CONFIRM" != "y" ] && exit 0

# ── 1. Установка зависимостей ───────────────────────────
print_step "Установка Docker и docker-compose..."

if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    print_ok "Docker установлен"
else
    print_ok "Docker уже установлен"
fi

if ! command -v docker compose &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
fi

# Проверяем docker compose
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    apt-get install -y -qq docker-compose
    COMPOSE="docker-compose"
fi

print_ok "Docker Compose: $($COMPOSE version 2>/dev/null || echo 'installed')"

# ── 2. Настройка .env ──────────────────────────────────
print_step "Настройка окружения..."

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    sed -i 's|MONGO_URL=.*|MONGO_URL=mongodb://mongo:27017|' backend/.env
    sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|" backend/.env
    print_warn "Создан backend/.env — ключи настраиваются в веб-панели"
else
    sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|" backend/.env
    print_ok "backend/.env уже существует (обновлён CORS)"
fi

# Сохраняем домен
echo "DOMAIN=$DOMAIN" > .env
print_ok "Домен сохранён: $DOMAIN"

# ── 3. SSL-сертификат ──────────────────────────────────
print_step "Поиск SSL-сертификатов..."

SSL_MODE=""
SSL_FOUND_FULLCHAIN=""
SSL_FOUND_PRIVKEY=""
SSL_FOUND_SOURCE=""

# ─── Функция: проверить и вывести инфо о сертификате ───
validate_cert() {
    local fullchain="$1"
    local privkey="$2"
    local source_label="$3"

    if [ ! -f "$fullchain" ] || [ ! -f "$privkey" ]; then
        return 1
    fi

    # Валидируем PEM
    if ! openssl x509 -in "$fullchain" -noout 2>/dev/null; then
        print_warn "Файл $fullchain — не валидный PEM-сертификат"
        return 1
    fi

    local cert_subject=$(openssl x509 -in "$fullchain" -noout -subject 2>/dev/null || echo "")
    local cert_dates=$(openssl x509 -in "$fullchain" -noout -dates 2>/dev/null || echo "")
    local cert_enddate=$(openssl x509 -in "$fullchain" -noout -enddate 2>/dev/null | cut -d= -f2)
    local cert_san=$(openssl x509 -in "$fullchain" -noout -ext subjectAltName 2>/dev/null | grep -oP 'DNS:[^ ,]+' | tr '\n' ' ' || echo "")

    echo ""
    print_ok "Найден SSL-сертификат: $source_label"
    echo -e "    ${YELLOW}Субъект: $cert_subject${NC}"
    [ -n "$cert_san" ] && echo -e "    ${YELLOW}Домены:  $cert_san${NC}"
    echo -e "    ${YELLOW}$cert_dates${NC}"

    # Проверяем срок действия
    if openssl x509 -in "$fullchain" -noout -checkend 0 2>/dev/null; then
        print_ok "Сертификат действителен (до $cert_enddate)"
    else
        print_warn "Сертификат ИСТЁК ($cert_enddate)"
        read -p "Использовать истёкший сертификат? (y/n): " USE_EXPIRED
        [ "$USE_EXPIRED" != "y" ] && return 1
    fi

    # Проверяем ключ
    if openssl rsa -in "$privkey" -check -noout 2>/dev/null || \
       openssl ec -in "$privkey" -check -noout 2>/dev/null; then
        print_ok "Приватный ключ валиден"
    else
        print_warn "Не удалось проверить приватный ключ (возможно формат PKCS#8 — продолжаем)"
    fi

    SSL_FOUND_FULLCHAIN="$fullchain"
    SSL_FOUND_PRIVKEY="$privkey"
    SSL_FOUND_SOURCE="$source_label"
    return 0
}

# ─── Приоритет 1: Папка ./ssl/ (ручные сертификаты) ───
if [ "$SSL_MODE" = "" ]; then
    if [ -f "./ssl/fullchain.pem" ] && [ -f "./ssl/privkey.pem" ]; then
        if validate_cert "./ssl/fullchain.pem" "./ssl/privkey.pem" "./ssl/ (ручные)"; then
            SSL_MODE="manual"
        fi
    fi
fi

# ─── Приоритет 2: /etc/letsencrypt/live/$DOMAIN ───
if [ "$SSL_MODE" = "" ]; then
    LE_DOMAIN_PATH="/etc/letsencrypt/live/$DOMAIN"
    if [ -f "$LE_DOMAIN_PATH/fullchain.pem" ] && [ -f "$LE_DOMAIN_PATH/privkey.pem" ]; then
        if validate_cert "$LE_DOMAIN_PATH/fullchain.pem" "$LE_DOMAIN_PATH/privkey.pem" "$LE_DOMAIN_PATH (certbot на хосте)"; then
            SSL_MODE="system_le"
        fi
    fi
fi

# ─── Приоритет 3: /etc/letsencrypt/live/* (wildcard или другие домены) ───
if [ "$SSL_MODE" = "" ] && [ -d "/etc/letsencrypt/live" ]; then
    for cert_dir in /etc/letsencrypt/live/*/; do
        [ ! -d "$cert_dir" ] && continue
        if [ -f "${cert_dir}fullchain.pem" ] && [ -f "${cert_dir}privkey.pem" ]; then
            # Проверяем подходит ли сертификат для нашего домена
            cert_domains=$(openssl x509 -in "${cert_dir}fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -oP 'DNS:\K[^ ,]+' || echo "")
            cert_cn=$(openssl x509 -in "${cert_dir}fullchain.pem" -noout -subject 2>/dev/null | grep -oP 'CN\s*=\s*\K[^ ]+' || echo "")

            domain_matches=false

            # Проверяем точное совпадение
            for d in $cert_domains $cert_cn; do
                if [ "$d" = "$DOMAIN" ]; then
                    domain_matches=true
                    break
                fi
                # Проверяем wildcard: *.example.com покрывает ai.example.com
                if [[ "$d" == \*.* ]]; then
                    wildcard_base="${d#\*.}"
                    domain_base="${DOMAIN#*.}"
                    if [ "$wildcard_base" = "$domain_base" ] || [ "$wildcard_base" = "$DOMAIN" ]; then
                        domain_matches=true
                        break
                    fi
                fi
            done

            if [ "$domain_matches" = true ]; then
                dir_name=$(basename "$cert_dir")
                if validate_cert "${cert_dir}fullchain.pem" "${cert_dir}privkey.pem" "/etc/letsencrypt/live/$dir_name/ (подходит для $DOMAIN)"; then
                    SSL_MODE="system_le"
                    break
                fi
            fi
        fi
    done

    # Если не нашли подходящий, покажем что есть
    if [ "$SSL_MODE" = "" ] && ls /etc/letsencrypt/live/*/fullchain.pem 1>/dev/null 2>&1; then
        echo ""
        print_warn "Найдены сертификаты в /etc/letsencrypt/live/, но ни один не подходит для $DOMAIN:"
        for cert_dir in /etc/letsencrypt/live/*/; do
            [ -f "${cert_dir}fullchain.pem" ] || continue
            dir_name=$(basename "$cert_dir")
            cert_cn=$(openssl x509 -in "${cert_dir}fullchain.pem" -noout -subject 2>/dev/null | grep -oP 'CN\s*=\s*\K[^ ]+' || echo "?")
            cert_san=$(openssl x509 -in "${cert_dir}fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -oP 'DNS:\K[^ ,]+' | tr '\n' ' ' || echo "")
            echo -e "    ${YELLOW}$dir_name/ → CN=$cert_cn ${cert_san:+SAN: $cert_san}${NC}"
        done
        echo ""
        read -p "Использовать один из них? Введите имя папки (или Enter для пропуска): " PICK_DIR
        if [ -n "$PICK_DIR" ] && [ -f "/etc/letsencrypt/live/$PICK_DIR/fullchain.pem" ]; then
            if validate_cert "/etc/letsencrypt/live/$PICK_DIR/fullchain.pem" "/etc/letsencrypt/live/$PICK_DIR/privkey.pem" "/etc/letsencrypt/live/$PICK_DIR/ (выбран вручную)"; then
                SSL_MODE="system_le"
            fi
        fi
    fi
fi

# ─── Копируем найденные сертификаты ───
if [ "$SSL_MODE" = "manual" ] || [ "$SSL_MODE" = "system_le" ]; then
    CERT_DST="./docker/ssl/live/$DOMAIN"
    mkdir -p "$CERT_DST"
    cp "$SSL_FOUND_FULLCHAIN" "$CERT_DST/fullchain.pem"
    cp "$SSL_FOUND_PRIVKEY" "$CERT_DST/privkey.pem"
    chmod 644 "$CERT_DST/fullchain.pem"
    chmod 600 "$CERT_DST/privkey.pem"
    print_ok "Сертификаты скопированы в docker/ssl/live/$DOMAIN/"

# ─── Ничего не найдено — предлагаем certbot ───
else
    echo ""
    print_warn "SSL-сертификаты не найдены. Проверены:"
    echo -e "    ${YELLOW}1. ./ssl/fullchain.pem + ./ssl/privkey.pem${NC}"
    echo -e "    ${YELLOW}2. /etc/letsencrypt/live/$DOMAIN/${NC}"
    echo -e "    ${YELLOW}3. /etc/letsencrypt/live/*/ (wildcard)${NC}"
    echo ""
    echo -e "    Чтобы использовать свои сертификаты (wildcard и др.):"
    echo -e "    ${YELLOW}cp /path/to/fullchain.pem ssl/fullchain.pem${NC}"
    echo -e "    ${YELLOW}cp /path/to/privkey.pem   ssl/privkey.pem${NC}"
    echo -e "    Затем перезапустите: ${YELLOW}bash install.sh${NC}"
    echo ""
    read -p "Получить бесплатный сертификат через Let's Encrypt? (y/n): " USE_LE

    if [ "$USE_LE" = "y" ]; then
        SSL_MODE="letsencrypt"
        print_step "Получение SSL через Let's Encrypt..."

        # Временный nginx для ACME-challenge
        mkdir -p /tmp/certbot-www
        cat > /tmp/nginx-temp.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Support AI Bot — SSL setup...';
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

        # Останавливаем всё что на 80 порту
        docker stop temp-nginx 2>/dev/null || true
        docker rm temp-nginx 2>/dev/null || true

        docker run -d --name temp-nginx \
            -p 80:80 \
            -v /tmp/nginx-temp.conf:/etc/nginx/conf.d/default.conf:ro \
            -v /tmp/certbot-www:/var/www/certbot \
            nginx:alpine

        sleep 2

        # Получаем сертификат
        CERT_DST="./docker/ssl/live/$DOMAIN"
        mkdir -p "$CERT_DST"

        docker run --rm \
            -v /tmp/certbot-www:/var/www/certbot \
            -v "$(pwd)/docker/ssl":/etc/letsencrypt \
            certbot/certbot certonly \
            --webroot \
            --webroot-path=/var/www/certbot \
            --email "$EMAIL" \
            --agree-tos \
            --no-eff-email \
            -d "$DOMAIN" \
            --non-interactive

        # Останавливаем временный nginx
        docker stop temp-nginx 2>/dev/null || true
        docker rm temp-nginx 2>/dev/null || true

        if [ -f "$CERT_DST/fullchain.pem" ]; then
            print_ok "SSL сертификат получен для $DOMAIN"
        else
            # certbot может положить в другой путь
            LE_PATH="./docker/ssl/live/$DOMAIN"
            if [ -f "$LE_PATH/fullchain.pem" ]; then
                print_ok "SSL сертификат получен для $DOMAIN"
            else
                print_err "Не удалось получить сертификат. Проверьте что DNS указывает на этот сервер."
                print_warn "Можно положить сертификаты вручную в ./ssl/ и перезапустить install.sh"
                exit 1
            fi
        fi
    else
        print_err "SSL-сертификат обязателен. Варианты:"
        echo "  1. Положите сертификаты в ./ssl/fullchain.pem и ./ssl/privkey.pem"
        echo "  2. Перезапустите install.sh и выберите Let's Encrypt"
        exit 1
    fi
fi

# ── 4. Генерация nginx-конфига ──────────────────────────
print_step "Настройка nginx..."

# Подставляем домен в шаблон
sed "s/\${DOMAIN}/$DOMAIN/g" docker/nginx/conf.d/app.conf > docker/nginx/conf.d/default.conf
print_ok "Nginx настроен для $DOMAIN"

# ── 5. Сборка и запуск ─────────────────────────────────
print_step "Сборка и запуск контейнеров..."

export DOMAIN

$COMPOSE -f docker-compose.prod.yml build --no-cache
$COMPOSE -f docker-compose.prod.yml up -d

print_ok "Все сервисы запущены!"

# ── 6. Проверка ────────────────────────────────────────
print_step "Проверка сервисов..."
sleep 5

if $COMPOSE -f docker-compose.prod.yml ps | grep -q "Up\|running"; then
    print_ok "Контейнеры работают"
else
    print_warn "Некоторые контейнеры могут запускаться..."
    $COMPOSE -f docker-compose.prod.yml ps
fi

# ── 7. Cron для автообновления (только для Let's Encrypt через наш certbot) ──
if [ "$SSL_MODE" = "letsencrypt" ]; then
    print_step "Настройка автообновления SSL..."
    CRON_CMD="0 3 * * * cd $(pwd) && $COMPOSE -f docker-compose.prod.yml run --rm certbot renew --quiet && $COMPOSE -f docker-compose.prod.yml exec -T nginx nginx -s reload"
    (crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_CMD") | crontab -
    print_ok "SSL автообновление настроено (cron каждый день в 3:00)"
elif [ "$SSL_MODE" = "system_le" ]; then
    print_ok "Сертификаты из /etc/letsencrypt/ — обновляются системным certbot"
    print_warn "После обновления сертификатов на хосте перезапустите:"
    echo "  bash install.sh    # пересоберёт с актуальными сертификатами"
    echo "  # или вручную:"
    echo "  cp /etc/letsencrypt/live/.../{fullchain,privkey}.pem docker/ssl/live/$DOMAIN/"
    echo "  $COMPOSE -f docker-compose.prod.yml restart nginx"
else
    print_ok "Ручные сертификаты — автообновление не настраивается"
    print_warn "Обновляйте сертификаты вручную до истечения срока:"
    echo "  cp /path/to/new/fullchain.pem ssl/fullchain.pem"
    echo "  cp /path/to/new/privkey.pem   ssl/privkey.pem"
    echo "  bash install.sh"
fi

# ── Итог ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗"
echo -e "║  ✓ Support AI Bot успешно установлен!                 ║"
echo -e "╠══════════════════════════════════════════════════════╣"
echo -e "║                                                      ║"
echo -e "║  Панель:  https://$DOMAIN"
echo -e "║  API:     https://$DOMAIN/api/"
echo -e "║                                                      ║"
if [ "$SSL_MODE" = "manual" ]; then
echo -e "║  SSL:     Ручные сертификаты из ./ssl/               ║"
elif [ "$SSL_MODE" = "system_le" ]; then
echo -e "║  SSL:     Системный certbot ($SSL_FOUND_SOURCE)"
else
echo -e "║  SSL:     Let's Encrypt (автообновление)             ║"
fi
echo -e "║                                                      ║"
echo -e "╠══════════════════════════════════════════════════════╣"
echo -e "║  СЛЕДУЮЩИЕ ШАГИ:                                     ║"
echo -e "║  1. Откройте панель: https://$DOMAIN"
echo -e "║  2. Настройки → Telegram API данные                  ║"
echo -e "║  3. Настройки → AI провайдер и ключ                  ║"
echo -e "║  4. Авторизуйте Telegram → Запустите бота            ║"
echo -e "║                                                      ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Полезные команды ─────────────────────────────────────
echo -e "${YELLOW}Полезные команды:${NC}"
echo -e "  Логи:        $COMPOSE -f docker-compose.prod.yml logs -f"
echo -e "  Статус:      $COMPOSE -f docker-compose.prod.yml ps"
echo -e "  Перезапуск:  $COMPOSE -f docker-compose.prod.yml restart"
echo -e "  Остановка:   $COMPOSE -f docker-compose.prod.yml down"
echo -e "  Обновление:  git pull && $COMPOSE -f docker-compose.prod.yml up -d --build"
echo ""
