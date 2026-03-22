#!/usr/bin/env bash
# Phase 2: Attach windowsbyburkhardt.com custom domain to the CloudFront distribution.
#
# Prerequisites:
#   - setup-static-cdn.sh already ran (distribution exists)
#   - ACM/KMS is working in your account
#   - You have the distribution ID (from GitHub secret CLOUDFRONT_DISTRIBUTION_ID)
#     or it will be auto-detected by the 'wbb-prod' comment tag
#
# Usage:
#   bash scripts/add-custom-domain.sh
#
#   Optional overrides:
#   CERT_ARN=arn:aws:acm:... CF_ID=EXXXXX bash scripts/add-custom-domain.sh
set -e

export AWS_PROFILE="wbb-admin"
REGION="us-east-1"
CUSTOM_DOMAIN="windowsbyburkhardt.com"
WWW_DOMAIN="www.windowsbyburkhardt.com"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Windows by Burkhardt — Attach Custom Domain (Phase 2) ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Find the distribution ──────────────────────────────────────────────────────
if [ -z "$CF_ID" ]; then
  CF_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='wbb-prod'].Id" \
    --output text 2>/dev/null)
  if [ -z "$CF_ID" ] || [ "$CF_ID" = "None" ]; then
    echo "❌  Could not find a CloudFront distribution tagged 'wbb-prod'."
    echo "    Set CF_ID=<distribution-id> and re-run."
    exit 1
  fi
fi
echo "✔  Distribution: $CF_ID"

# ── Request or locate ACM certificate ─────────────────────────────────────────
echo ""
echo "─── ACM certificate ────────────────────────────────"

if [ -z "$CERT_ARN" ]; then
  CERT_ARN=$(aws acm list-certificates \
    --region us-east-1 \
    --certificate-statuses ISSUED \
    --query "CertificateSummaryList[?DomainName=='$CUSTOM_DOMAIN' || DomainName=='$WWW_DOMAIN' || DomainName=='*.$CUSTOM_DOMAIN'].CertificateArn" \
    --output text 2>/dev/null | head -1)
fi

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  echo "    No ISSUED cert found — requesting one..."
  CERT_ARN=$(aws acm request-certificate \
    --region us-east-1 \
    --domain-name "$CUSTOM_DOMAIN" \
    --subject-alternative-names "$WWW_DOMAIN" \
    --validation-method DNS \
    --query "CertificateArn" \
    --output text)
  echo ""
  echo "  ⚠️  ACTION REQUIRED — DNS Validation"
  echo "  Add these CNAME records to your DNS provider:"
  echo ""
  aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region us-east-1 \
    --query "Certificate.DomainValidationOptions[].ResourceRecord" \
    --output table
  echo ""
  echo "  Then wait ~5 minutes for status ISSUED and re-run:"
  echo "    CERT_ARN=$CERT_ARN CF_ID=$CF_ID bash scripts/add-custom-domain.sh"
  exit 0
fi

CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query "Certificate.Status" \
  --output text)

if [ "$CERT_STATUS" != "ISSUED" ]; then
  echo "❌  Certificate status is '$CERT_STATUS' — re-run once it shows ISSUED."
  exit 1
fi
echo "✔  Certificate: $CERT_ARN"

# ── Update the distribution: add aliases + swap to ACM cert ───────────────────
echo ""
echo "─── Updating CloudFront distribution ───────────────"

# Get current config + ETag (required for updates)
CONFIG=$(aws cloudfront get-distribution-config --id "$CF_ID")
ETAG=$(echo "$CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['ETag'])")
DIST_CONFIG=$(echo "$CONFIG" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['DistributionConfig']))")

# Patch aliases and viewer certificate
PATCHED=$(echo "$DIST_CONFIG" | python3 -c "
import sys, json
c = json.load(sys.stdin)
c['Aliases'] = {'Quantity': 2, 'Items': ['$CUSTOM_DOMAIN', '$WWW_DOMAIN']}
c['ViewerCertificate'] = {
            'ACMCertificateArn': '$CERT_ARN',
    'SSLSupportMethod': 'sni-only',
    'MinimumProtocolVersion': 'TLSv1.2_2021',
    'Certificate': '$CERT_ARN',
    'CertificateSource': 'acm'
}
print(json.dumps(c))
")

aws cloudfront update-distribution \
  --id "$CF_ID" \
  --if-match "$ETAG" \
  --distribution-config "$PATCHED" \
  --output text > /dev/null

echo "✔  Distribution updated with custom domain aliases + ACM cert"
echo "    Waiting for deployment (~3 min)..."
aws cloudfront wait distribution-deployed --id "$CF_ID"
echo "✔  Deployed!"

CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_ID" \
  --query "Distribution.DomainName" --output text)

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  DONE — custom domain attached                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Update DNS at your registrar:"
echo "  $CUSTOM_DOMAIN    ALIAS/CNAME → $CF_DOMAIN"
echo "  $WWW_DOMAIN  ALIAS/CNAME → $CF_DOMAIN"
echo ""
echo "Update APP_RUNNER_DOMAIN GitHub secret to your custom domain:"
echo "  gh secret set APP_RUNNER_DOMAIN --body '$CUSTOM_DOMAIN' --repo cjburkha/windows-by-burkhardt"
echo ""
