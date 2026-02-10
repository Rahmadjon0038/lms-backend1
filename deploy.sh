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

cat > docker-compose.deploy.yml <<'YAML'
version: "3.9"

services:
  postgres:
    image: postgres:16
    container_name: lms_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: lsm123
      POSTGRES_DB: lms
    ports:
      - "4000:5432"
    volumes:
      - lms_pgdata:/var/lib/postgresql/data

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: lms_backend
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      PORT: 3001
      DB_USER: postgres
      DB_PASSWORD: lsm123
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: lms
      JWT_SECRET: maxfiy_kalit_123@
      REFRESH_TOKEN_SECRET: refresh_uchun_maxfiy_kalit_456!
    ports:
      - "3001:3001"
    volumes:
      - ./uploads:/app/uploads
      - ./private_uploads:/app/private_uploads

volumes:
  lms_pgdata:
YAML

echo "Docker compose orqali postgres + backend ishga tushirilmoqda..."
"${COMPOSE_CMD[@]}" -f docker-compose.deploy.yml up -d --build

echo ""
echo "Tayyor:"
echo "  Backend:  http://localhost:3001"
echo "  Swagger:  http://localhost:3001/api-docs"
echo "  Postgres: localhost:4000 (user: postgres, db: lms)"
