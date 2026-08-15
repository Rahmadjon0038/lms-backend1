#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose topilmadi. Docker Desktop yoki docker-compose o'rnating."
  exit 1
fi

COMPOSE_FILE="docker-compose.prod.yml"

# Eski, qo'lda ishga tushirilgan "test" backend konteyneri 3001-portni
# band qilib turishi mumkin (masalan avvalgi deploy usulidan qolgan).
# U hozirgi compose loyihasiga tegishli emas, shuning uchun avtomatik
# to'xtatilmaydi — faqat aynan shu nom bilan mavjud bo'lsa, portni
# bo'shatish uchun to'xtatiladi (o'chirilmaydi, kerak bo'lsa qayta
# ishga tushirish mumkin: docker start lms_backend_test).
if docker ps --format '{{.Names}}' | grep -qx 'lms_backend_test'; then
  echo "Eski 'lms_backend_test' konteyneri 3001-portni band qilgan, to'xtatilmoqda..."
  docker stop lms_backend_test >/dev/null
fi

echo "Docker compose orqali postgres (postgres16, mavjud ma'lumotlar bilan) + backend ishga tushirilmoqda..."
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" up -d --build

echo ""
echo "Tayyor:"
echo "  Backend:  http://localhost:3001"
echo "  Swagger:  http://localhost:3001/api-docs"
echo "  Postgres: docker ichida postgres16:5432 (host port ochilmagan, ma'lumotlar 'pgdata' volume'da saqlanadi)"
