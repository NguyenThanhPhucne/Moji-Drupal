#!/bin/sh
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

git config core.hooksPath .githooks
echo "Git hooks enabled at .githooks for $(basename "$repo_root")"
echo "To fully activate pre-push hook, ensure executable bit is set:"
echo "  chmod +x .githooks/pre-push"