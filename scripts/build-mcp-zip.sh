#!/usr/bin/env bash
# Builds the disci-mcp Lambda zip: mcp_server/disci_mcp + Python deps (Linux arm64 wheels).
# Output: build/mcp.zip. Works on macOS or Linux, no Docker needed.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/build"
PKG="$OUT/mcp"

rm -rf "$PKG" "$OUT/mcp.zip"
mkdir -p "$PKG"

echo "-- python dependencies (linux arm64, glibc 2.28+ to match the Lambda runtime, python 3.13)"
(cd "$ROOT/mcp_server" && uv export --frozen --no-dev --no-hashes --no-emit-project -q -o "$OUT/mcp-requirements.txt")
uv pip install -q --target "$PKG" --python-platform aarch64-manylinux_2_28 --python-version 3.13 \
  --only-binary :all: -r "$OUT/mcp-requirements.txt"

echo "-- server code"
cp -R "$ROOT/mcp_server/disci_mcp" "$PKG/disci_mcp"
find "$PKG" -name __pycache__ -prune -exec rm -rf {} +

echo "-- zip"
(cd "$PKG" && zip -qr -X "$OUT/mcp.zip" .)
echo "built $OUT/mcp.zip ($(du -h "$OUT/mcp.zip" | cut -f1))"
