#!/bin/sh
set -e

# Meet Cute runs on Neon Postgres (DATABASE_URL / DIRECT_URL come from Fly
# secrets). Schema is applied once per deploy via the Fly release_command
# (see fly.toml), not here, so multiple instances do not race on DDL.
if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set"
  exit 1
fi

echo "[entrypoint] Starting Next.js on :3009"
exec npx next start -p 3009 -H 0.0.0.0
