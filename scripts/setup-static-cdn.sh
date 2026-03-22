#!/usr/bin/env bash
# One-time setup: S3 bucket + CloudFront distribution for static file hosting.
#
# Phase 1 (this script) — no ACM cert required:
#   Browser → CloudFront (xxxx.cloudfront.net  — HTTPS via CloudFront default cert)
#                 ├── /api/*   → App Runner  (Node.js API)
#                 ├── /health  → App Runner
#                 └── /*       → S3 bucket   (HTML/CSS/JS — instant deploys)
#
# Phase 2 (after ACM/KMS works) — attach custom domain:
#   bash scripts/add-custom-domain.sh
#   → adds windowsbyburkhardt.com alias + ACM cert to the distribution
#
# Usage:
#   bash scripts/setup-static-cdn.sh
set -e

export AWS_PROFILE="wbb-admin"
REGION="us-east-1"
ACCOUNT_ID="669143131098"
BUCKET_NAME="wbb-static-prod"
APP_RUNNER_DOMAIN="j5fym334tp.us-east-1.awsapprunner.com"
CUSTOM_DOMAIN="windowsbyburkhardt.com"
WWW_DOMAIN="www.windowsbyburkhardt.com"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Windows by Burkhardt — Static CDN Setup        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: S3 bucket ──────────────────────────────────────────────────────────
echo "─── Step 1: S3 bucket ──────────────────────────────"

EXISTING_BUCKET=$(aws s3api head-bucket --bucket "$BUCKET_NAME" 2>&1 || echo "NOT_FOUND")
if echo "$EXISTING_BUCKET" | grep -q "NOT_FOUND\|404\|NoSuchBucket"; then
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --output text > /dev/null
  echo "✔  Created bucket: $BUCKET_NAME"
else
  echo "✔  Bucket already exists: $BUCKET_NAME"
fi

# Block all public access (CloudFront OAC provides access)
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --output text > /dev/null
echo "✔  Public access blocked (CloudFront OAC will provide access)"

# ── Step 2: Upload initial static files ───────────────────────────────────────
echo ""
echo "─── Step 2: Upload static files ───────────────────"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"

# HTML — no-cache so browsers always fetch the latest
aws s3 sync "$PUBLIC_DIR/" "s3://$BUCKET_NAME/" \
  --exclude "*" --include "*.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --delete
# CSS, JS, SVG — long cache (filenames don't change but CloudFront invalidation handles updates)
aws s3 sync "$PUBLIC_DIR/" "s3://$BUCKET_NAME/" \
  --exclude "*.html" \
  --cache-control "public,max-age=86400" \
  --delete
echo "✔  Static files uploaded"

# ── Step 3: CloudFront Origin Access Control ───────────────────────────────────
echo ""
echo "─── Step 3: CloudFront OAC ─────────────────────────"

EXISTING_OAC=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='wbb-s3-oac'].Id" \
  --output text 2>/dev/null)

if [ -z "$EXISTING_OAC" ] || [ "$EXISTING_OAC" = "None" ]; then
  OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config '{
      "Name": "wbb-s3-oac",
      "Description": "OAC for WBB static S3 bucket",
      "SigningProtocol": "sigv4",
      "SigningBehavior": "always",
      "OriginAccessControlOriginType": "s3"
    }' \
    --query "OriginAccessControl.Id" \
    --output text)
  echo "✔  Created OAC: $OAC_ID"
else
  OAC_ID="$EXISTING_OAC"
  echo "✔  Reusing existing OAC: $OAC_ID"
fi

# ── Step 4: ACM Certificate — SKIPPED in Phase 1 ──────────────────────────────
echo ""
echo "─── Step 4: ACM cert — skipped (Phase 1 uses CloudFront default HTTPS) ───"
echo "    Run scripts/add-custom-domain.sh after KMS/ACM is working to attach"
echo "    windowsbyburkhardt.com with a real cert."

# ── Step 5: CloudFront distribution ───────────────────────────────────────────
echo ""
echo "─── Step 5: CloudFront distribution ───────────────"

EXISTING_CF=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='wbb-prod'].Id" \
  --output text 2>/dev/null)

if [ -n "$EXISTING_CF" ] && [ "$EXISTING_CF" != "None" ]; then
  CF_ID="$EXISTING_CF"
  CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_ID" \
    --query "Distribution.DomainName" --output text)
  echo "✔  Reusing existing distribution: $CF_ID ($CF_DOMAIN)"
else
  echo "    Creating CloudFront distribution..."

  S3_ORIGIN_DOMAIN="${BUCKET_NAME}.s3.${REGION}.amazonaws.com"
  CALLER_REF="wbb-$(date +%s)"

  CF_ID=$(aws cloudfront create-distribution --distribution-config "{
    \"CallerReference\": \"$CALLER_REF\",
    \"Comment\": \"wbb-prod\",
    \"DefaultRootObject\": \"index.html\",
    \"Aliases\": {\"Quantity\": 0, \"Items\": []},
    \"Origins\": {
      \"Quantity\": 2,
      \"Items\": [
        {
          \"Id\": \"S3-wbb-static\",
          \"DomainName\": \"$S3_ORIGIN_DOMAIN\",
          \"S3OriginConfig\": {\"OriginAccessIdentity\": \"\"},
          \"OriginAccessControlId\": \"$OAC_ID\"
        },
        {
          \"Id\": \"AppRunner-wbb-api\",
          \"DomainName\": \"$APP_RUNNER_DOMAIN\",
          \"CustomOriginConfig\": {
            \"HTTPPort\": 80,
            \"HTTPSPort\": 443,
            \"OriginProtocolPolicy\": \"https-only\",
            \"OriginSslProtocols\": {\"Quantity\": 1, \"Items\": [\"TLSv1.2\"]}
          }
        }
      ]
    },
    \"CacheBehaviors\": {
      \"Quantity\": 2,
      \"Items\": [
        {
          \"PathPattern\": \"/api/*\",
          \"TargetOriginId\": \"AppRunner-wbb-api\",
          \"ViewerProtocolPolicy\": \"redirect-to-https\",
          \"AllowedMethods\": {\"Quantity\": 7, \"Items\": [\"GET\",\"HEAD\",\"OPTIONS\",\"PUT\",\"POST\",\"PATCH\",\"DELETE\"], \"CachedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"]}},
          \"ForwardedValues\": {\"QueryString\": true, \"Cookies\": {\"Forward\": \"none\"}, \"Headers\": {\"Quantity\": 1, \"Items\": [\"Content-Type\"]}},
          \"MinTTL\": 0,
          \"DefaultTTL\": 0,
          \"MaxTTL\": 0,
          \"Compress\": false
        },
        {
          \"PathPattern\": \"/health\",
          \"TargetOriginId\": \"AppRunner-wbb-api\",
          \"ViewerProtocolPolicy\": \"redirect-to-https\",
          \"AllowedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"], \"CachedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"]}},
          \"ForwardedValues\": {\"QueryString\": false, \"Cookies\": {\"Forward\": \"none\"}, \"Headers\": {\"Quantity\": 0, \"Items\": []}},
          \"MinTTL\": 0,
          \"DefaultTTL\": 0,
          \"MaxTTL\": 0,
          \"Compress\": false
        }
      ]
    },
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"S3-wbb-static\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"AllowedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"], \"CachedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"]}},
      \"ForwardedValues\": {\"QueryString\": false, \"Cookies\": {\"Forward\": \"none\"}, \"Headers\": {\"Quantity\": 0, \"Items\": []}},
      \"MinTTL\": 0,
      \"DefaultTTL\": 86400,
      \"MaxTTL\": 31536000,
      \"Compress\": true
    },
    \"Enabled\": true,
    \"HttpVersion\": \"http2\",
    \"ViewerCertificate\": {
      \"CloudFrontDefaultCertificate\": true
    }
  }" --query "Distribution.{Id:Id,Domain:DomainName}" --output json)

  CF_ID=$(echo "$CF_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Id'])")
  CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_ID" --query "Distribution.DomainName" --output text)
  echo "✔  Distribution created: $CF_ID"
  echo "    Waiting for it to deploy (~5 min)..."
  aws cloudfront wait distribution-deployed --id "$CF_ID"
  echo "✔  Distribution deployed!"
fi

# ── Step 6: S3 bucket policy (allow CloudFront OAC) ───────────────────────────
echo ""
echo "─── Step 6: S3 bucket policy ───────────────────────"

aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"AllowCloudFrontOAC\",
    \"Effect\": \"Allow\",
    \"Principal\": {\"Service\": \"cloudfront.amazonaws.com\"},
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${BUCKET_NAME}/*\",
    \"Condition\": {
      \"StringEquals\": {
        \"AWS:SourceArn\": \"arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${CF_ID}\"
      }
    }
  }]
}"
echo "✔  Bucket policy set (CloudFront OAC access only)"

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  DONE — next steps                                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "CloudFront domain : https://$CF_DOMAIN"
echo "Distribution ID   : $CF_ID"
echo "S3 bucket         : $BUCKET_NAME"
echo ""
echo "════ PHASE 1 COMPLETE ════"
echo ""
echo "The site is now live at https://$CF_DOMAIN"
echo "(CloudFront default HTTPS — no custom domain yet)"
echo ""
echo "── Required: Add GitHub secrets ──────────────────────────────"
echo "Run these 3 commands:"
echo ""
echo "  gh secret set S3_BUCKET_NAME --body '$BUCKET_NAME' --repo cjburkha/windows-by-burkhardt"
echo "  gh secret set CLOUDFRONT_DISTRIBUTION_ID --body '$CF_ID' --repo cjburkha/windows-by-burkhardt"
echo "  gh secret set APP_RUNNER_DOMAIN --body '$CF_DOMAIN' --repo cjburkha/windows-by-burkhardt"
echo ""
echo "── Required: Grant WBB-Deploy S3 + CloudFront permissions ────"
echo ""
echo "  AWS_PROFILE=wbb-admin aws iam put-user-policy \\"
echo "    --user-name WBB-Deploy \\"
echo "    --policy-name WBBDeployPolicy \\"
echo "    --policy-document file://scripts/wbb-deploy-apprunner-policy.json"
echo ""
echo "── Phase 2 (later): attach windowsbyburkhardt.com ────────────"
echo ""
echo "  Once ACM/KMS is fully working:"
echo "  bash scripts/add-custom-domain.sh"
echo ""
