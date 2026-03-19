#!/usr/bin/env bash
# Creates (or recreates) the Windows by Burkhardt App Runner service from ECR.
# Run: bash scripts/create-apprunner.sh
set -e

ACCOUNT_ID="669143131098"
REGION="us-east-1"
SERVICE_NAME="windows-by-burkhardt"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${SERVICE_NAME}:latest"
ROLE_NAME="AppRunnerECRAccessRole"

# ── Load .env for SES values if it exists ─────────────────────────────────────
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

: "${AWS_SES_ACCESS_KEY_ID:?  AWS_SES_ACCESS_KEY_ID not set. Add it to .env}"
: "${AWS_SES_SECRET_ACCESS_KEY:?  AWS_SES_SECRET_ACCESS_KEY not set. Add it to .env}"
: "${AWS_SES_FROM_EMAIL:?  AWS_SES_FROM_EMAIL not set. Add it to .env}"
: "${RECIPIENT_EMAIL:?  RECIPIENT_EMAIL not set. Add it to .env}"
: "${DATABASE_URL:?  DATABASE_URL not set. Run: bash scripts/create-rds.sh prod}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Windows by Burkhardt — App Runner Setup        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: ECR access role ────────────────────────────────────────────────────
echo "─── Step 1: ECR access role ───────────────────────"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
TRUST_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
ECR_POLICY_ARN="arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"

# Delete and recreate to ensure trust policy and policy attachment are correct
echo "    Deleting old role if it exists..."
aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "$ECR_POLICY_ARN" 2>/dev/null || true
aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || true
sleep 5

echo "    Creating role with correct trust policy..."
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --output text > /dev/null

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$ECR_POLICY_ARN"

echo "    Waiting for role to propagate..."
sleep 15
echo "✔  Role ready: $ROLE_ARN"

# ── Step 2: Delete any existing (failed/running) service ─────────────────────
echo ""
echo "─── Step 2: Check for existing service ────────────"
EXISTING_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" \
  --output text 2>/dev/null || true)

if [ -n "$EXISTING_ARN" ] && [ "$EXISTING_ARN" != "None" ]; then
  STATUS=$(aws apprunner describe-service \
    --service-arn "$EXISTING_ARN" \
    --region "$REGION" \
    --query 'Service.Status' --output text 2>/dev/null || echo "UNKNOWN")
  echo "    Found existing service — Status: $STATUS"

  if [ "$STATUS" = "CREATE_FAILED" ] || [ "$STATUS" = "DELETE_FAILED" ] || [ "$STATUS" = "RUNNING" ] || [ "$STATUS" = "OPERATION_IN_PROGRESS" ]; then
    echo "    Deleting $EXISTING_ARN ..."
    aws apprunner delete-service \
      --service-arn "$EXISTING_ARN" \
      --region "$REGION" > /dev/null
    echo "    Waiting 60s for deletion to complete..."
    sleep 60
    echo "✔  Old service deleted"
  fi
else
  echo "✔  No existing service found"
fi

# ── Step 3: Create App Runner service ─────────────────────────────────────────
echo ""
echo "─── Step 3: Create App Runner service ─────────────"
echo "    Image: $IMAGE_URI"
echo "    Role:  $ROLE_ARN"
echo ""

SERVICE_ARN=$(aws apprunner create-service \
  --region "$REGION" \
  --service-name "$SERVICE_NAME" \
  --source-configuration "{
    \"AuthenticationConfiguration\": {
      \"AccessRoleArn\": \"$ROLE_ARN\"
    },
    \"ImageRepository\": {
      \"ImageIdentifier\": \"$IMAGE_URI\",
      \"ImageRepositoryType\": \"ECR\",
      \"ImageConfiguration\": {
        \"Port\": \"3000\",
        \"RuntimeEnvironmentVariables\": {
          \"NODE_ENV\": \"production\",
          \"AWS_REGION\": \"$REGION\",
          \"AWS_ACCESS_KEY_ID\": \"$AWS_SES_ACCESS_KEY_ID\",
          \"AWS_SECRET_ACCESS_KEY\": \"$AWS_SES_SECRET_ACCESS_KEY\",
          \"AWS_SES_FROM_EMAIL\": \"$AWS_SES_FROM_EMAIL\",
          \"RECIPIENT_EMAIL\": \"$RECIPIENT_EMAIL\",
          \"DATABASE_URL\": \"$DATABASE_URL\"
        }
      }
    },
    \"AutoDeploymentsEnabled\": false
  }" \
  --health-check-configuration "Protocol=HTTP,Path=/health,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=5" \
  --instance-configuration "Cpu=0.25 vCPU,Memory=0.5 GB" \
  --query 'Service.ServiceArn' --output text)

echo "✔  Service created!"
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXT STEPS                                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "1. Update GitHub secret APP_RUNNER_SERVICE_ARN:"
echo "   gh secret set APP_RUNNER_SERVICE_ARN --repo cjburkha/windows-by-burkhardt"
echo "   Paste: $SERVICE_ARN"
echo ""
echo "2. Service is deploying — check status in ~2 min:"
echo "   aws apprunner describe-service \\"
echo "     --service-arn \"$SERVICE_ARN\" \\"
echo "     --region $REGION \\"
echo "     --query '{Status:Service.Status,URL:Service.ServiceUrl}'"
echo ""
