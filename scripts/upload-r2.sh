#!/usr/bin/env bash
# Upload assets/* tree to R2 bucket "azura-media".
# Requires: wrangler logged in. Run from project root.
set -euo pipefail

BUCKET="${AZURA_R2_BUCKET:-azura-media}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Uploading assets/ to R2 bucket: $BUCKET"
cd "$ROOT"

count=0
while IFS= read -r -d '' f; do
  rel="${f#./assets/}"
  ct="application/octet-stream"
  case "$f" in
    *.webp) ct="image/webp" ;;
    *.png)  ct="image/png" ;;
    *.jpg|*.jpeg) ct="image/jpeg" ;;
    *.svg)  ct="image/svg+xml" ;;
    *.mp4)  ct="video/mp4" ;;
  esac
  wrangler r2 object put "$BUCKET/$rel" --file "$f" --content-type "$ct" --remote >/dev/null
  count=$((count+1))
  printf '  [%3d] %s\n' "$count" "$rel"
done < <(find ./assets -type f -print0)

echo "Done. Uploaded $count files."
