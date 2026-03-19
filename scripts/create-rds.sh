#!/usr/bin/env bash
# Creates an RDS PostgreSQL instance for Windows by Burkhardt.
# Usage:
#   bash scripts/create-rds.sh dev    — creates wbb-dev  (public, free tier)
#   bash scripts/create-rds.sh prod   — creates wbb-prod (public, ssl-only)
#
# After running, copy the DATABASE_URL printed at the end into:
#   dev  → .env
#   prod → GitHub secret DATABASE_URL + App Runner env var
set -e

# ── AWS Profile ────────────────────────────────────────────────────────────────
# Infrastructure scripts always use wbb-admin (EC2/RDS permissions).
# The running app uses AWS_SES_* keys from .env — this profile is never used at runtime.
export AWS_PROFILE="wbb-admin"

# ── Config ─────────────────────────────────────────────────────────────────────
ACCOUNT_ID="669143131098"
REGION="us-east-1"
DB_ENGINE="postgres"
DB_ENGINE_VERSION="16.6"
DB_INSTANCE_CLASS="db.t3.micro"
DB_ALLOCATED_STORAGE=20
DB_NAME="wbb"
DB_PORT=5432

ENV="${1:-dev}"
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
  echo "Usage: bash scripts/create-rds.sh [dev|prod]"
  exit 1
fi

DB_IDENTIFIER="wbb-${ENV}"
SG_NAME="wbb-rds-${ENV}"
DB_USER="wbbadmin"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Windows by Burkhardt — RDS Setup (${ENV})         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Prompt for password ────────────────────────────────────────────────────────
read -s -p "Enter a strong DB password for '${DB_USER}' (min 8 chars): " DB_PASSWORD
echo ""
if [ ${#DB_PASSWORD} -lt 8 ]; then
  echo "❌  Password too short (min 8 characters)."
  exit 1
fi

# Save password to temp file so setup-dev.sh can auto-write DATABASE_URL to .env
echo -n "$DB_PASSWORD" > "/tmp/wbb-${ENV}-dbpass"

# ── Step 1: Get default VPC ────────────────────────────────────────────────────
echo ""
echo "─── Step 1: Locate default VPC ────────────────────"
VPC_ID=$(aws ec2 describe-vpcs \
  --region "$REGION" \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" \
  --output text)

if [ -z "$VPC_ID" ] || [ "$VPC_ID" = "None" ]; then
  echo "❌  No default VPC found in $REGION. Create one in the AWS Console first."
  exit 1
fi
echo "✔  VPC: $VPC_ID"

# ── Step 2: Security group ─────────────────────────────────────────────────────
echo ""
echo "─── Step 2: Security group ─────────────────────────"

# Delete existing SG with same name if it exists
EXISTING_SG=$(aws ec2 describe-security-groups \
  --region "$REGION" \
  --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" \
  --output text 2>/dev/null || true)

if [ -n "$EXISTING_SG" ] && [ "$EXISTING_SG" != "None" ]; then
  echo "    Found existing security group $EXISTING_SG — reusing it."
  SG_ID="$EXISTING_SG"
else
  SG_ID=$(aws ec2 create-security-group \
    --region "$REGION" \
    --group-name "$SG_NAME" \
    --description "RDS PostgreSQL access for wbb-${ENV}" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" \
    --output text)
  echo "✔  Created security group: $SG_ID"
fi

# For dev: allow access from your current IP
# For prod: allow access from anywhere (App Runner uses dynamic IPs); SSL enforced at the DB level
if [ "$ENV" = "dev" ]; then
  MY_IP=$(curl -s https://checkip.amazonaws.com)/32
  echo "    Adding inbound rule: port 5432 from your IP ($MY_IP)"
  aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port "$DB_PORT" \
    --cidr "$MY_IP" 2>/dev/null || echo "    (Rule already exists — skipping)"
else
  echo "    Adding inbound rule: port 5432 from 0.0.0.0/0 (SSL enforced by parameter group)"
  aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port "$DB_PORT" \
    --cidr 0.0.0.0/0 2>/dev/null || echo "    (Rule already exists — skipping)"
fi
echo "✔  Security group ready: $SG_ID"

# ── Step 3: Parameter group (enforce SSL for prod) ─────────────────────────────
if [ "$ENV" = "prod" ]; then
  echo ""
  echo "─── Step 3: Parameter group (SSL required) ─────────"
  PG_NAME="wbb-prod-ssl"
  aws rds create-db-parameter-group \
    --region "$REGION" \
    --db-parameter-group-name "$PG_NAME" \
    --db-parameter-group-family "postgres16" \
    --description "Force SSL for wbb-prod" 2>/dev/null || echo "    (Parameter group already exists — skipping)"

  aws rds modify-db-parameter-group \
    --region "$REGION" \
    --db-parameter-group-name "$PG_NAME" \
    --parameters "ParameterName=rds.force_ssl,ParameterValue=1,ApplyMethod=pending-reboot" \
    --output text > /dev/null
  echo "✔  Parameter group '$PG_NAME' ready (SSL enforced)"
  PARAM_GROUP_ARG="--db-parameter-group-name $PG_NAME"
else
  PARAM_GROUP_ARG=""
fi

# ── Step 4: Create RDS instance ────────────────────────────────────────────────
echo ""
echo "─── Step 4: Create RDS instance ───────────────────"

EXISTING_RDS=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "$DB_IDENTIFIER" \
  --query "DBInstances[0].DBInstanceStatus" \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$EXISTING_RDS" != "NOT_FOUND" ] && [ "$EXISTING_RDS" != "None" ]; then
  echo "    Instance '$DB_IDENTIFIER' already exists (status: $EXISTING_RDS)."
  echo "    Skipping creation — fetching endpoint instead."
else
  echo "    Creating '$DB_IDENTIFIER' — this takes ~5 minutes..."
  aws rds create-db-instance \
    --region "$REGION" \
    --db-instance-identifier "$DB_IDENTIFIER" \
    --db-instance-class "$DB_INSTANCE_CLASS" \
    --engine "$DB_ENGINE" \
    --engine-version "$DB_ENGINE_VERSION" \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASSWORD" \
    --db-name "$DB_NAME" \
    --allocated-storage "$DB_ALLOCATED_STORAGE" \
    --storage-type gp2 \
    --no-multi-az \
    --publicly-accessible \
    --vpc-security-group-ids "$SG_ID" \
    --backup-retention-period 7 \
    --no-deletion-protection \
    $PARAM_GROUP_ARG \
    --output text > /dev/null
  echo "    Instance creation initiated. Waiting for it to become available..."
  aws rds wait db-instance-available \
    --region "$REGION" \
    --db-instance-identifier "$DB_IDENTIFIER"
  echo "✔  Instance available!"
fi

# ── Step 5: Fetch endpoint ─────────────────────────────────────────────────────
echo ""
echo "─── Step 5: Fetch endpoint ─────────────────────────"
ENDPOINT=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "$DB_IDENTIFIER" \
  --query "DBInstances[0].Endpoint.Address" \
  --output text)

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${ENDPOINT}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "✔  Endpoint: $ENDPOINT"
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  DONE — copy your DATABASE_URL below            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "DATABASE_URL=$DATABASE_URL"
echo ""

if [ "$ENV" = "dev" ]; then
  echo "Next steps (dev):"
  echo "  1. Add DATABASE_URL to your .env file"
  echo "  2. Run: npm run db:migrate -- --name init"
  echo "  3. Verify with: npm run db:studio"
else
  echo "Next steps (prod):"
  echo "  1. Add DATABASE_URL as a GitHub secret:"
  echo "     gh secret set DATABASE_URL --repo cjburkha/windows-by-burkhardt"
  echo "  2. Add DATABASE_URL to App Runner env vars:"
  echo "     bash scripts/create-apprunner.sh  (re-run to pick up the new var)"
  echo "  3. First deploy will run: npx prisma migrate deploy"
fi
echo ""
