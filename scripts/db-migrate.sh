#!/usr/bin/env bash
# Run pending Prisma migrations against the target database.
#
# Usage:
#   bash scripts/db-migrate.sh            — uses DATABASE_URL from .env or environment
#   DATABASE_URL=postgresql://... bash scripts/db-migrate.sh
#
# In CI/deploy: DATABASE_URL is injected as a secret, so no .env is needed.
# Locally: DATABASE_URL is loaded from .env automatically via dotenv in prisma.config.ts.
#
# Uses `prisma migrate deploy` (not `migrate dev`) — safe for production:
#   - Only applies migrations that are already committed to prisma/migrations/
#   - Never generates new migration files
#   - Exits non-zero if any migration fails (blocks the deploy)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "─── Database migrations ────────────────────────────"

# Resolve DATABASE_URL — fall back to .env if not already set
if [ -z "$DATABASE_URL" ]; then
  if [ -f "$ROOT_DIR/.env" ]; then
    export $(grep -v '^#' "$ROOT_DIR/.env" | grep DATABASE_URL | xargs)
  fi
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌  DATABASE_URL is not set."
  echo "    For dev:  add DATABASE_URL to .env (run: npm run db:create:dev)"
  echo "    For prod: set DATABASE_URL as a GitHub Actions secret"
  exit 1
fi

# Mask password in log output
DB_LOG_URL=$(echo "$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
echo "    Target: $DB_LOG_URL"
echo ""

cd "$ROOT_DIR"
npx prisma migrate deploy

echo ""
echo "✔  Migrations complete."
echo ""
