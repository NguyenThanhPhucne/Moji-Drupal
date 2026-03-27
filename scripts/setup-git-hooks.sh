#!/bin/sh
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

git config core.hooksPath .githooks
chmod +x .githooks/pre-push

echo "Git hooks enabled at .githooks for $(basename "$repo_root")"
echo "Pre-push protection is active."