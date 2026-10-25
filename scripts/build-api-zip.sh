#!/usr/bin/env bash
# Builds the Lambda deployment zip shared by disci-api and disci-migrator:
#   api/app + Python deps (Linux arm64 wheels) + db/migrations + db/aws + dbmate binary.
# Output: build/api.zip. Works on macOS or Linux, no Docker needed.
set -euo pipefail

DBMATE_VERSION=2.36.0
DBMATE_SHA256=c7d49db4b54e487eddf8ce7d6e88f4035e1eb04c7edb16008f668cdfad2f29e8 # linux-arm64

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/build"
PKG="$OUT/api"
DBMATE_CACHE="$OUT/cache/dbmate-$DBMATE_VERSION-linux-arm64"

rm -rf "$PKG" "$OUT/api.zip"
mkdir -p "$PKG/bin" "$PKG/db" "$OUT/cache"

echo "-- python dependencies (linux arm64, glibc 2.28+ to match the Lambda runtime, python 3.13)"
(cd "$ROOT/api" && uv export --frozen --no-dev --no-hashes --no-emit-project -q -o "$OUT/requirements.txt")
uv pip install -q --target "$PKG" --python-platform aarch64-manylinux_2_28 --python-version 3.13 \
  --only-binary :all: -r "$OUT/requirements.txt"

echo "-- app code and migrations"
cp -R "$ROOT/api/app" "$PKG/app"
cp -R "$ROOT/db/migrations" "$PKG/db/migrations"
cp -R "$ROOT/db/aws" "$PKG/db/aws"
find "$PKG" -name __pycache__ -prune -exec rm -rf {} +

echo "-- dbmate $DBMATE_VERSION"
if [[ ! -f "$DBMATE_CACHE" ]]; then
  curl -fsSL -o "$DBMATE_CACHE.tmp" \
    "https://github.com/amacneil/dbmate/releases/download/v$DBMATE_VERSION/dbmate-linux-arm64"
  mv "$DBMATE_CACHE.tmp" "$DBMATE_CACHE"
fi
echo "$DBMATE_SHA256  $DBMATE_CACHE" | shasum -a 256 -c -s || {
  echo "dbmate checksum mismatch" >&2
  rm -f "$DBMATE_CACHE"
  exit 1
}
install -m 0755 "$DBMATE_CACHE" "$PKG/bin/dbmate"

echo "-- zip"
(cd "$PKG" && zip -qr -X "$OUT/api.zip" .)
echo "built $OUT/api.zip ($(du -h "$OUT/api.zip" | cut -f1))"
