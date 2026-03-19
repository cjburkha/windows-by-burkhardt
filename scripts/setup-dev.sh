#!/usr/bin/env bash
# Full dev database setup: creates RDS instance then runs all migrations.
#
# Usage: bash scripts/setup-dev.sh
#
# What it does:
#   1. Runs create-rds.sh dev  — provisions wbb-dev RDS PostgreSQL instance
#   2. Prompts you to add DATABASE_URL to .env
#   3. Runs db-migrate.sh      — applies all migrations to the new database
#   4. Opens Prisma Studio      — lets you browse the empty schema
set -e

# Infrastructure scripts always run as wbb-admin (EC2/RDS permissions)
export AWS_PROFILE="wbb-admin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Windows by Burkhardt — Dev Database Setup      ║"
echo "╚══════════════════════════════════════════════════╝"

# ── Step 1: Create RDS ────────────────────────────────────────────────────────
echo ""
echo "Step 1/3 — Create RDS instance"
echo ""
bash "$SCRIPT_DIR/create-rds.sh" dev

# ── Step 2: Auto-write DATABASE_URL to .env ─────────────────────────────────
DB_URL=$(AWS_PROFILE=wbb-admin aws rds describe-db-instances \
  --db-instance-identifier wbb-dev \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Read password that was set during create-rds.sh (stored in a temp file)
DB_PASS_FILE="/tmp/wbb-dev-dbpass"
if [[ -f "$DB_PASS_FILE" ]]; then
  DB_PASS=$(cat "$DB_PASS_FILE")
  rm -f "$DB_PASS_FILE"
else
  echo "⚠ Could not find saved password. Please enter it:"
  read -s -p "DB password: " DB_PASS
  echo ""
fi

DATABASE_URL="postgresql://wbbadmin:${DB_PASS}@${DB_URL}:5432/wbb?sslmode=require"

if grep -q '^DATABASE_URL=' "$ROOT_DIR/.env"; then
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "$ROOT_DIR/.env"
else
  echo "DATABASE_URL=\"${DATABASE_URL}\"" >> "$ROOT_DIR/.env"
fi

echo "✔  DATABASE_URL written to .env"

# ── Step 3: Run migrations ────────────────────────────────────────────────────
echo ""
echo "Step 2/3 — Run migrations"
echo ""
bash "$SCRIPT_DIR/db-migrate.sh"

# ── Step 4: Verify with Prisma Studio ────────────────────────────────────────
echo "Step 3/3 — Opening Prisma Studio (Ctrl+C to close)"
echo ""
cd "$ROOT_DIR"
npx prisma studio
