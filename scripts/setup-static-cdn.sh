#!/usr/bin/env bash
# One-time setup: S3 bucket + CloudFront distribution for static file hosting.
#
# Architecture after running this:
#   Browser → CloudFront (windowsbyburkhardt.com)
#                 ├── /api/*   → App Runner  (Node.js API)
#                 ├── /health  → App Runner
#                 └── /*       → S3 bucket   (HTML/CSS/JS — instant deploys)
#
# Usage:
#   bash scripts/setup-static-cdn.sh
#
# After running:
#   1. Update GitHub secret APP_RUNNER_DOMAIN → CloudFront domain printed below
#   2. Add GitHub secrets: S3_BUCKET_NAME, CLOUDFRONT_DISTRIBUTION_ID
#   3. Update DNS: point windowsbyburkhardt.com + www to the CloudFront domain
#   4. Run: AWS_PROFILE=wbb-admin aws iam put-user-policy ... (printed at end)
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

# ── Step 4: ACM Certificate ────────────────────────────────────────────────────
echo ""
echo "─── Step 4: ACM Certificate (us-east-1) ────────────"

# CloudFront requires certs in us-east-1
CERT_ARN=$(aws acm list-certificates \
  --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='$CUSTOM_DOMAIN' || DomainName=='*.$CUSTOM_DOMAIN'].CertificateArn" \
  --output text 2>/dev/null | head -1)

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  echo "    No existing certificate found — requesting new one..."
  CERT_ARN=$(aws acm request-certificate \
    --region us-east-1 \
    --domain-name "$CUSTOM_DOMAIN" \
    --subject-alternative-names "$WWW_DOMAIN" \
    --validation-method DNS \
    --query "CertificateArn" \
    --output text)
  echo ""
  echo "  ⚠️  ACTION REQUIRED — DNS Validation"
  echo "  ─────────────────────────────────────────────────"
  echo "  A new TLS certificate was requested. You must add"
  echo "  a DNS CNAME record to validate it before continuing."
  echo ""
  echo "  Run this to see the CNAME to add:"
  echo "    AWS_PROFILE=wbb-admin aws acm describe-certificate \\"
  echo "      --certificate-arn $CERT_ARN \\"
  echo "      --region us-east-1 \\"
  echo "      --query 'Certificate.DomainValidationOptions'"
  echo ""
  echo "  Add the CNAME to your DNS provider, then wait ~5 min"
  echo "  for validation, then re-run this script."
  echo ""
  read -p "Press ENTER once the cert is ISSUED (status: ISSUED) to continue..."
fi

CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query "Certificate.Status" \
  --output text)

if [ "$CERT_STATUS" != "ISSUED" ]; then
  echo "❌  Certificate status is '$CERT_STATUS' (need ISSUED). Re-run after DNS validation."
  exit 1
fi
echo "✔  Certificate: $CERT_ARN (ISSUED)"

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
    \"Aliases\": {
      \"Quantity\": 2,
      \"Items\": [\"$CUSTOM_DOMAIN\", \"$WWW_DOMAIN\"]
    },
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
            \"HTTPSPort\": 443,
            \"OriginProtocolPolicy\": \"https-only\",
            \"OriginSSLProtocols\": {\"Quantity\": 1, \"Items\": [\"TLSv1.2\"]}
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
      \"ACMCertificateArn\": \"$CERT_ARN\",
      \"SSLSupportMethod\": \"sni-only\",
      \"MinimumProtocolVersion\": \"TLSv1.2_2021\"
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
echo "CloudFront domain : $CF_DOMAIN"
echo "Distribution ID   : $CF_ID"
echo "S3 bucket         : $BUCKET_NAME"
echo ""
echo "1. Add these GitHub secrets:"
echo "     S3_BUCKET_NAME             = $BUCKET_NAME"
echo "     CLOUDFRONT_DISTRIBUTION_ID = $CF_ID"
echo "     APP_RUNNER_DOMAIN          = $CF_DOMAIN   ← update this (was App Runner URL)"
echo ""
echo "   Run:"
echo "     gh secret set S3_BUCKET_NAME --body '$BUCKET_NAME' --repo cjburkha/windows-by-burkhardt"
echo "     gh secret set CLOUDFRONT_DISTRIBUTION_ID --body '$CF_ID' --repo cjburkha/windows-by-burkhardt"
echo "     gh secret set APP_RUNNER_DOMAIN --body '$CF_DOMAIN' --repo cjburkha/windows-by-burkhardt"
echo ""
echo "2. Update DNS at your registrar:"
echo "     $CUSTOM_DOMAIN    ALIAS/CNAME → $CF_DOMAIN"
echo "     $WWW_DOMAIN  ALIAS/CNAME → $CF_DOMAIN"
echo ""
echo "3. Grant WBB-Deploy user S3 + CloudFront permissions:"
echo "     AWS_PROFILE=wbb-admin aws iam put-user-policy \\"
echo "       --user-name WBB-Deploy \\"
echo "       --policy-name WBBDeployPolicy \\"
echo "       --policy-document file://scripts/wbb-deploy-apprunner-policy.json"
echo ""
