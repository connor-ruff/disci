#!/usr/bin/env bash
set -euo pipefail

# Resolve the hub repo from the script's real location (follows symlinks)
# Script lives at <hub>/.claude/bin/, so the hub is two levels up
SCRIPT="$(realpath "${BASH_SOURCE[0]}")"
HUB="$(cd "$(dirname "$SCRIPT")/../.." && pwd)"

# Other repos this project spans (the hub is the primary working directory)
REPOS=(
  "$HOME/source/repos/aws_iac_mngr"
)

ADD_DIRS=()
for repo in "${REPOS[@]}"; do
  ADD_DIRS+=(--add-dir "$repo")
done

cd "$HUB"
exec claude "${ADD_DIRS[@]}" "$@"