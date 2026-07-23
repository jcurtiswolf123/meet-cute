#!/bin/sh
set -e

# Meet Cute runs on Neon Postgres (DATABASE_URL / DIRECT_URL come from Fly
# secrets). Schema changes are applied manually out-of-band with `npm run
# db:deploy` (prisma db push) against Neon, never here, so booting instances
# never race on DDL and a deploy can't be blocked by a DB round-trip.
if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set"
  exit 1
fi

echo "[entrypoint] Starting Next.js on :3009"
exec node server.js
