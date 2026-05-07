-- AZURA Migration 006: Visibility fixes
-- Run this against your D1 database via:
--   wrangler d1 execute azura_db --file=006_visibility_fixes.sql --remote
--
-- What this fixes:
--   1. chapters table: ensure `status` column exists with correct default
--      (old 001_base schema had no status column — inserts from the worker
--       assumed it existed, silently storing NULL, making chapters invisible
--       to the published-only public query)
--   2. chapters table: ensure `manhwa_id` column name matches worker queries
--      (001_base used manga_id; worker uses manhwa_id)
--   3. banners table: add missing columns the worker expects (slot, media_type,
--      r2_key, poster_key, display_order, start_date, end_date, created_by,
--      updated_at) that were not in 003_full_schema/005_kv_and_banners
--   4. Fix any existing chapters rows with NULL status → 'published'
--   5. Fix any existing banners rows with active NULL → 1

-- ── 1. chapters: add status column if missing ─────────────────────────────────
-- SQLite ignores "ADD COLUMN IF NOT EXISTS" syntax; use a safe pattern.
-- If the column already exists this will raise "duplicate column" — that is
-- harmless and can be ignored during migration execution.

ALTER TABLE chapters ADD COLUMN status TEXT NOT NULL DEFAULT 'published';

-- ── 2. chapters: add manhwa_id alias column ───────────────────────────────────
-- The 001_base migration named it manga_id; the worker expects manhwa_id.
-- Rather than rename (which SQLite does not support in older versions),
-- add manhwa_id as an extra column and keep manga_id for backward compat.
-- If your schema already has manhwa_id, this will fail silently.

ALTER TABLE chapters ADD COLUMN manhwa_id TEXT;

-- Back-fill manhwa_id from manga_id for any pre-existing rows
UPDATE chapters SET manhwa_id = manga_id WHERE manhwa_id IS NULL AND manga_id IS NOT NULL;

-- ── 3. chapters: add scheduled_at if missing ─────────────────────────────────
ALTER TABLE chapters ADD COLUMN scheduled_at INTEGER DEFAULT NULL;

-- ── 4. banners: add all v16 worker columns ───────────────────────────────────
ALTER TABLE banners ADD COLUMN slot TEXT NOT NULL DEFAULT 'home-hero';
ALTER TABLE banners ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';
ALTER TABLE banners ADD COLUMN r2_key TEXT NOT NULL DEFAULT '';
ALTER TABLE banners ADD COLUMN poster_key TEXT NOT NULL DEFAULT '';
ALTER TABLE banners ADD COLUMN display_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE banners ADD COLUMN start_date TEXT DEFAULT NULL;
ALTER TABLE banners ADD COLUMN end_date TEXT DEFAULT NULL;
ALTER TABLE banners ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
ALTER TABLE banners ADD COLUMN updated_at INTEGER DEFAULT 0;

-- Back-fill r2_key from legacy `image` column for pre-existing rows
-- (003_full_schema stored image URL in `image` TEXT column)
UPDATE banners SET r2_key = image WHERE r2_key = '' AND image IS NOT NULL AND image != '';

-- ── 5. Fix NULL/missing status on existing chapters ───────────────────────────
-- Any chapter inserted before this migration without a status would be NULL,
-- making them invisible to the `WHERE status = 'published'` public filter.
UPDATE chapters SET status = 'published' WHERE status IS NULL OR status = '';

-- ── 6. Fix NULL active flag on existing banners ──────────────────────────────
UPDATE banners SET active = 1 WHERE active IS NULL;

-- ── 7. Add performance indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chapters_status        ON chapters(status);
CREATE INDEX IF NOT EXISTS idx_chapters_manhwa_status ON chapters(manhwa_id, status);
CREATE INDEX IF NOT EXISTS idx_chapters_scheduled     ON chapters(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_banners_active_slot    ON banners(active, slot);
CREATE INDEX IF NOT EXISTS idx_banners_order          ON banners(display_order);
