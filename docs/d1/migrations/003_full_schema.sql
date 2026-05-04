-- Migration 003: complete schema for all features used by the UI
-- Adds: manhwa catalog, chapter pages, sessions, ratings, likes, comments,
--       notifications, audit log, coin ledger.

CREATE TABLE IF NOT EXISTS manhwa (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ongoing',
  type TEXT NOT NULL DEFAULT 'manhwa',
  genres_json TEXT DEFAULT '[]',
  rating REAL NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  cover TEXT DEFAULT '',
  description TEXT DEFAULT '',
  is_adult INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chapter_pages (
  chapter_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  byte_size INTEGER DEFAULT 0,
  PRIMARY KEY (chapter_id, page_no)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT DEFAULT '',
  ip TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ratings (
  uid TEXT NOT NULL,
  manhwa_id TEXT NOT NULL,
  score REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, manhwa_id)
);

CREATE TABLE IF NOT EXISTS likes (
  uid TEXT NOT NULL,
  target_type TEXT NOT NULL, -- manhwa | chapter | comment
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  manhwa_id TEXT NOT NULL,
  chapter_id TEXT DEFAULT '',
  parent_id TEXT DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  read_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT DEFAULT '',
  target_id TEXT DEFAULT '',
  detail_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT DEFAULT '',
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Foreign-key-like constraints are emulated at app level; D1 supports FKs but
-- on-cascade rules need PRAGMA + careful ordering. We keep this as the safe baseline.
