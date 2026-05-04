#!/usr/bin/env bash
# Run all D1 migrations + seed data against the configured D1 database.
# Reads database name from wrangler.toml.
set -euo pipefail

DB="${AZURA_D1_DB:-azura}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Running migrations against D1: $DB"
for f in docs/d1/migrations/*.sql; do
  echo "  → $f"
  wrangler d1 execute "$DB" --remote --file "$f"
done

echo "==> Seeding catalog (manhwa)"
node scripts/generate-d1-seed.js
wrangler d1 execute "$DB" --remote --file docs/d1/seed/manhwa.sql

echo "==> Migrations + seed complete"
