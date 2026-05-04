PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  vip INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'local',
  avatar TEXT DEFAULT '',
  extra_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS library (
  uid TEXT NOT NULL,
  manhwa_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'saved',
  favorite INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  last_chapter_id TEXT DEFAULT '',
  last_read_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, manhwa_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  uid TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  manhwa_id TEXT NOT NULL,
  percent REAL NOT NULL DEFAULT 0,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (uid, chapter_id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  manhwa_id TEXT NOT NULL,
  chapter_no REAL NOT NULL,
  title TEXT DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'manhwa',
  access_type TEXT NOT NULL DEFAULT 'free',
  coin_price INTEGER NOT NULL DEFAULT 0,
  vip_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  format TEXT NOT NULL DEFAULT 'webp',
  page_count INTEGER NOT NULL DEFAULT 0,
  pdf_id TEXT DEFAULT NULL,
  extra_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  folder TEXT DEFAULT '',
  filename TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT DEFAULT '',
  poster_key TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
