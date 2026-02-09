#!/bin/bash
# ============================================
#  Support AI Bot — Обновление
#  
#  Использование:
#    bash update.sh
# ============================================

set -e

BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

print_step() { echo -e "\n${BLUE}▸ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }

# Определяем docker compose
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    print_err "Docker Compose не найден!"
    exit 1
fi

# Проверяем что мы в правильной папке
if [ ! -f "docker-compose.prod.yml" ]; then
    print_err "Запустите скрипт из папки проекта (где находится docker-compose.prod.yml)"
    exit 1
fi

# Загружаем домен из .env если есть
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo -e "${GREEN}╔══════════════════════════════════════════╗"
echo -e "║   Support AI Bot — Обновление            ║"
echo -e "╚══════════════════════════════════════════╝${NC}"

# 1. Получаем обновления
print_step "Получение обновлений из Git..."
git pull --ff-only
print_ok "Репозиторий обновлён"

# 2. Останавливаем контейнеры
print_step "Остановка контейнеров..."
$COMPOSE -f docker-compose.prod.yml down
print_ok "Контейнеры остановлены"

# 3. Пересобираем
print_step "Пересборка образов..."
$COMPOSE -f docker-compose.prod.yml build --no-cache
print_ok "Образы пересобраны"

# 4. Запускаем
print_step "Запуск контейнеров..."
$COMPOSE -f docker-compose.prod.yml up -d
print_ok "Контейнеры запущены"

# 5. Проверяем статус
print_step "Проверка статуса..."
sleep 5
$COMPOSE -f docker-compose.prod.yml ps

echo ""
print_ok "Обновление завершено!"
[ -n "$DOMAIN" ] && echo -e "Панель: ${GREEN}https://$DOMAIN${NC}"
echo ""
