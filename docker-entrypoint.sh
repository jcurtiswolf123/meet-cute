#!/bin/sh
set -e

export DATABASE_URL="file:/data/prod.db"
mkdir -p /data

if [ ! -f /data/prod.db ]; then
  echo "[entrypoint] First boot: creating schema + seeding roster..."
  npx prisma db push --skip-generate
  npx tsx scripts/seed.ts
else
  echo "[entrypoint] Existing database found, ensuring schema is current..."
  npx prisma db push --skip-generate
fi

echo "[entrypoint] Starting Next.js on :3009"
exec npx next start -p 3009 -H 0.0.0.0
