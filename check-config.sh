#!/bin/bash
# Configuration check script for Support AI Bot

echo "=== Support AI Bot Configuration Check ==="
echo ""

# Check .env file
if [ -f ".env" ]; then
    echo "[OK] .env file exists"
    
    if grep -q "^DOMAIN=" .env; then
        DOMAIN_VAL=$(grep "^DOMAIN=" .env | cut -d'=' -f2)
        if [ -n "$DOMAIN_VAL" ]; then
            echo "[OK] DOMAIN is set: $DOMAIN_VAL"
        else
            echo "[ERROR] DOMAIN is empty in .env"
        fi
    else
        echo "[ERROR] DOMAIN is not set in .env"
    fi
else
    echo "[ERROR] .env file not found"
    echo ""
    echo "Create .env file with:"
    echo "  echo 'DOMAIN=your-domain.com' > .env"
fi

echo ""

# Check backend .env
if [ -f "backend/.env" ]; then
    echo "[OK] backend/.env file exists"
else
    echo "[WARN] backend/.env file not found"
fi

echo ""

# Check if containers are running
echo "=== Docker Status ==="
if command -v docker &> /dev/null; then
    docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null
else
    echo "[WARN] Docker not found"
fi

echo ""
echo "=== Rebuild Commands ==="
echo "If frontend shows white screen, rebuild with:"
echo "  docker compose down"
echo "  docker compose build --no-cache frontend"
echo "  docker compose up -d"
