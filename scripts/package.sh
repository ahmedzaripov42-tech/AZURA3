#!/usr/bin/env bash
# Builds a clean, deploy-safe zip of the project.
# Excludes: .git, node_modules, OS junk, editor cache, logs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:-azura-deploy}"
OUT="${OUT_DIR:-$ROOT/../}"
ZIP="$OUT/${NAME}.zip"

cd "$ROOT"

echo "==> Validating before package…"
node scripts/validate-build.js

# shellcheck disable=SC2046
rm -f "$ZIP"

echo "==> Creating $ZIP"
zip -rq "$ZIP" . \
  -x ".git/*" \
  -x ".git" \
  -x "node_modules/*" \
  -x "**/.DS_Store" \
  -x "**/Thumbs.db" \
  -x "**/*.swp" \
  -x "**/*.swo" \
  -x "**/*~" \
  -x ".idea/*" \
  -x ".vscode/*" \
  -x ".cache/*" \
  -x "**/*.log" \
  -x ".wrangler/*" \
  -x ".dev.vars" \
  -x ".env" \
  -x ".env.local"

echo "==> Verifying zip excludes .git"
if unzip -l "$ZIP" | grep -E '(\.git/|\.DS_Store|node_modules)' >/dev/null; then
  echo "✗ ZIP contains forbidden entries — failing."
  unzip -l "$ZIP" | grep -E '(\.git/|\.DS_Store|node_modules)'
  exit 1
fi

bytes=$(stat -c%s "$ZIP" 2>/dev/null || stat -f%z "$ZIP")
echo "✓ Clean package: $ZIP ($((bytes/1024)) KB)"
