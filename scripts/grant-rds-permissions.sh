#!/usr/bin/env bash
# scripts/grant-rds-permissions.sh
# Attaches the full WBB-Admin-Policy to a given IAM user.
# Uses the wbb-admin AWS profile (EC2/RDS/IAM permissions required).
#
# Usage:
#   bash scripts/grant-rds-permissions.sh [username]
#   Default username: WBB-Admin

set -e

export AWS_PROFILE="wbb-admin"

IAM_USER="${1:-WBB-Admin}"
POLICY_NAME="WBB-Admin-Policy"
POLICY_FILE="$(dirname "$0")/wbb-admin-policy.json"

echo "▶ Attaching $POLICY_NAME to IAM user: $IAM_USER"

aws iam put-user-policy \
  --user-name "$IAM_USER" \
  --policy-name "$POLICY_NAME" \
  --policy-document "file://$POLICY_FILE"

echo "✅ Policy '$POLICY_NAME' attached to $IAM_USER"
