-- Migration 005: Banners table
CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL DEFAULT 'home-hero',
  title TEXT DEFAULT '',
  link TEXT DEFAULT '',
  media_type TEXT DEFAULT 'image',
  media TEXT DEFAULT '',
  poster TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_banners_slot ON banners(slot);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(active);
