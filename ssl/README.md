# SSL-сертификаты

Положите ваши сертификаты сюда:

```
ssl/
├── fullchain.pem    # Сертификат + цепочка (Certificate + CA Bundle)
└── privkey.pem      # Приватный ключ
```

## Wildcard сертификат

Если у вас wildcard-сертификат `*.example.com`:

1. Скопируйте файлы:
   ```bash
   cp /path/to/fullchain.pem ssl/fullchain.pem
   cp /path/to/privkey.pem   ssl/privkey.pem
   ```

2. Запустите установку — скрипт автоматически обнаружит сертификаты:
   ```bash
   sudo bash install.sh
   ```

## Формат файлов

**fullchain.pem** — полная цепочка:
```
-----BEGIN CERTIFICATE-----
(ваш сертификат)
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
(промежуточный CA)
-----END CERTIFICATE-----
```

**privkey.pem** — приватный ключ:
```
-----BEGIN PRIVATE KEY-----
(ключ)
-----END PRIVATE KEY-----
```

## Источники сертификатов

| Провайдер | Файл сертификата | Файл ключа |
|---|---|---|
| **Let's Encrypt** | `fullchain.pem` | `privkey.pem` |
| **Cloudflare Origin** | Origin Certificate → `fullchain.pem` | Private Key → `privkey.pem` |
| **cPanel / ISPmanager** | certificate.crt + ca_bundle.crt → объединить в `fullchain.pem` | private.key → `privkey.pem` |
| **Certbot (ручной)** | `/etc/letsencrypt/live/domain/fullchain.pem` | `/etc/letsencrypt/live/domain/privkey.pem` |

### Объединение crt + ca_bundle:
```bash
cat certificate.crt ca_bundle.crt > ssl/fullchain.pem
cp private.key ssl/privkey.pem
```
