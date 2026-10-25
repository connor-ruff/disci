#!/usr/bin/env bash
# Deploys Disci to AWS: migrate the database, ship the API, publish the web app.
# The infrastructure must already exist (aws_iac_mngr/controlled_resources/disci).
#
#   From a laptop:  AWS_PROFILE=connor-ruff-dev-acct scripts/deploy.sh
#   From CI:        .github/workflows/deploy.yml (OIDC credentials)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
export AWS_REGION=us-east-2 AWS_PAGER=""

cfg() { aws ssm get-parameter --name "/disci/prod/$1" --query Parameter.Value --output text; }

echo "==> Reading deploy config from SSM"
API_FN=$(cfg lambda_api_name)
MIGRATOR_FN=$(cfg lambda_migrator_name)
API_URL=$(cfg api_url)
WEB_URL=$(cfg web_url)
WEB_BUCKET=$(cfg web_bucket)
DISTRIBUTION_ID=$(cfg cloudfront_distribution_id)
COGNITO_POOL_ID=$(cfg cognito_user_pool_id)
COGNITO_CLIENT_ID=$(cfg cognito_client_id)
COGNITO_DOMAIN=$(cfg cognito_domain)

echo "==> Building API package"
"$ROOT/scripts/build-api-zip.sh"

update_code() {
  aws lambda update-function-code --function-name "$1" \
    --zip-file "fileb://$ROOT/build/api.zip" --output text --query LastUpdateStatus >/dev/null
  aws lambda wait function-updated-v2 --function-name "$1"
}

# Migrations run before the new API code goes live, so they must stay compatible with
# the currently deployed API (add first, remove in a later release).
echo "==> Migrating database"
update_code "$MIGRATOR_FN"
aws lambda invoke --function-name "$MIGRATOR_FN" --cli-read-timeout 320 \
  "$ROOT/build/migrator-result.json" >"$ROOT/build/migrator-invoke.json"
cat "$ROOT/build/migrator-result.json"
echo
if grep -q FunctionError "$ROOT/build/migrator-invoke.json"; then
  echo "Migration failed; API and web were NOT updated." >&2
  exit 1
fi

echo "==> Updating API"
update_code "$API_FN"

echo "==> Building web"
(
  cd "$ROOT/web"
  npm ci --no-fund --no-audit --loglevel=error
  VITE_API_URL="$API_URL" \
    VITE_AUTH_MODE=cognito \
    VITE_COGNITO_AUTHORITY="https://cognito-idp.$AWS_REGION.amazonaws.com/$COGNITO_POOL_ID" \
    VITE_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
    VITE_COGNITO_DOMAIN="$COGNITO_DOMAIN" \
    npm run build
)

echo "==> Publishing web"
# Hashed assets never change, so cache them forever. Everything else (index.html) is
# revalidated on every load so a deploy is picked up immediately. Old assets are kept
# so tabs still running the previous version don't break.
aws s3 sync "$ROOT/web/dist/assets" "s3://$WEB_BUCKET/assets" \
  --cache-control "public,max-age=31536000,immutable" --only-show-errors
aws s3 sync "$ROOT/web/dist" "s3://$WEB_BUCKET" --exclude "assets/*" --delete \
  --cache-control "no-cache" --only-show-errors
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" \
  --paths "/index.html" "/" --output text --query Invalidation.Id >/dev/null

echo "==> Deployed: $WEB_URL"
