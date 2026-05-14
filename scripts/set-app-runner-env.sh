#!/usr/bin/env bash
# Set (or update) a runtime environment variable on the windows-by-burkhardt
# App Runner service without touching the AWS console.
#
# Usage:
#   APEX_DATABASE_URL="postgres://user:pass@host/db" \
#     bash scripts/set-app-runner-env.sh APEX_DATABASE_URL
#
#   # remove a variable:
#   bash scripts/set-app-runner-env.sh APEX_DATABASE_URL --unset
#
# The value is read from a same-named env var in your shell so it never
# appears in the script invocation (and never lands in repo or shell history
# if you `export` it first).
set -e

export AWS_PROFILE="${AWS_PROFILE:-wbb-admin}"
REGION="us-east-1"
SERVICE_NAME="windows-by-burkhardt"

KEY="$1"
MODE="${2:-set}"  # 'set' (default) or '--unset'

if [ -z "$KEY" ]; then
  echo "Usage: VAR_NAME=value bash scripts/set-app-runner-env.sh VAR_NAME [--unset]" >&2
  exit 1
fi

if [ "$MODE" = "set" ]; then
  VALUE="${!KEY:-}"
  if [ -z "$VALUE" ]; then
    echo "❌  $KEY is not set in your shell. Export it first:" >&2
    echo "    export $KEY='...'" >&2
    exit 1
  fi
fi

# ── Find the service ──────────────────────────────────────────────────────────
SERVICE_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn | [0]" \
  --output text)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "❌  Could not find App Runner service '$SERVICE_NAME' in $REGION." >&2
  exit 1
fi
echo "✔  Service: $SERVICE_ARN"

# ── Build new SourceConfiguration ─────────────────────────────────────────────
# App Runner's update-service requires the entire SourceConfiguration; you
# cannot patch a single env var. Pull the current config, merge our key in
# (or remove it), and send it back.
CURRENT=$(aws apprunner describe-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --query "Service.SourceConfiguration" \
  --output json)

PATCHED=$(KEY="$KEY" VALUE="${VALUE:-}" MODE="$MODE" python3 <<'PY'
import json, os, sys
src = json.loads(sys.stdin.read())
img = src.get("ImageRepository", {})
cfg = img.get("ImageConfiguration", {})
env = dict(cfg.get("RuntimeEnvironmentVariables", {}) or {})
key, val, mode = os.environ["KEY"], os.environ["VALUE"], os.environ["MODE"]
if mode == "--unset":
    env.pop(key, None)
else:
    env[key] = val
cfg["RuntimeEnvironmentVariables"] = env
img["ImageConfiguration"] = cfg
src["ImageRepository"] = img
print(json.dumps(src))
PY
<<<"$CURRENT")

if [ "$MODE" = "--unset" ]; then
  echo "─── Removing $KEY from App Runner service ─────────"
else
  echo "─── Setting $KEY on App Runner service ─────────────"
  echo "    (value length: ${#VALUE} chars — not printed)"
fi

aws apprunner update-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --source-configuration "$PATCHED" \
  --output text > /dev/null

echo "✔  Update submitted. Waiting for service to settle..."

# Poll until status leaves OPERATION_IN_PROGRESS (App Runner has no
# 'wait service-updated' command).
for i in $(seq 1 60); do
  STATUS=$(aws apprunner describe-service \
    --service-arn "$SERVICE_ARN" \
    --region "$REGION" \
    --query "Service.Status" \
    --output text)
  if [ "$STATUS" = "RUNNING" ]; then
    echo "✔  Service is RUNNING — $KEY is live."
    exit 0
  fi
  if [ "$STATUS" = "CREATE_FAILED" ] || [ "$STATUS" = "DELETE_FAILED" ] || [ "$STATUS" = "PAUSED" ]; then
    echo "❌  Service status: $STATUS — check the App Runner console." >&2
    exit 1
  fi
  printf "    [%2d/60] status=%s — waiting...\r" "$i" "$STATUS"
  sleep 10
done
echo ""
echo "⚠️  Timed out after 10 minutes waiting for service to return to RUNNING." >&2
echo "    Check status with:" >&2
echo "    aws apprunner describe-service --service-arn $SERVICE_ARN --query 'Service.Status'" >&2
exit 1
