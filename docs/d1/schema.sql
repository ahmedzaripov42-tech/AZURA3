-- AZURA D1 Schema v8
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner','admin','user')),
  coins INTEGER NOT NULL DEFAULT 0,
  vip INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'local',
  avatar TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

CREATE TABLE IF NOT EXISTS manhwa (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manhwa',
  status TEXT NOT NULL DEFAULT 'ongoing',
  cover_key TEXT,
  cover_url TEXT,
  description TEXT,
  genres_json TEXT NOT NULL DEFAULT '[]',
  rating REAL NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  is_18 INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manhwa_status ON manhwa(status);
CREATE INDEX IF NOT EXISTS idx_manhwa_is18 ON manhwa(is_18);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  manhwa_id TEXT NOT NULL REFERENCES manhwa(id) ON DELETE CASCADE,
  chapter_no REAL NOT NULL,
  title TEXT,
  content_type TEXT NOT NULL DEFAULT 'manhwa',
  access_type TEXT NOT NULL DEFAULT 'free' CHECK(access_type IN ('free','coin','vip')),
  price INTEGER NOT NULL DEFAULT 0,
  vip INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  format TEXT NOT NULL DEFAULT 'webp',
  page_count INTEGER NOT NULL DEFAULT 0,
  pdf_asset_id TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(uid),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_manhwa ON chapters(manhwa_id, chapter_no);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  bucket TEXT NOT NULL DEFAULT 'azura-media',
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(uid),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_key ON media_assets(object_key);

CREATE TABLE IF NOT EXISTS chapter_pages (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  asset_id TEXT NOT NULL REFERENCES media_assets(id),
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(chapter_id, page_index)
);
CREATE INDEX IF NOT EXISTS idx_pages_chapter ON chapter_pages(chapter_id, page_index);

CREATE TABLE IF NOT EXISTS library (
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  manhwa_id TEXT NOT NULL REFERENCES manhwa(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'saved' CHECK(state IN ('saved','reading','completed')),
  favorite INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  last_chapter_id TEXT,
  last_read_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(uid, manhwa_id)
);
CREATE INDEX IF NOT EXISTS idx_library_uid_state ON library(uid, state);

CREATE TABLE IF NOT EXISTS reading_progress (
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  manhwa_id TEXT NOT NULL REFERENCES manhwa(id) ON DELETE CASCADE,
  percent REAL NOT NULL DEFAULT 0,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY(uid, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_uid_manhwa ON reading_progress(uid, manhwa_id);

CREATE TABLE IF NOT EXISTS ratings (
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  manhwa_id TEXT NOT NULL REFERENCES manhwa(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(uid, manhwa_id)
);

CREATE TABLE IF NOT EXISTS likes (
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  manhwa_id TEXT NOT NULL REFERENCES manhwa(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(uid, manhwa_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  manhwa_id TEXT NOT NULL REFERENCES manhwa(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_manhwa ON comments(manhwa_id, status, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_uid ON notifications(uid, read, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_uid TEXT REFERENCES users(uid),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_uid, created_at);

CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_uid TEXT REFERENCES users(uid),
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coin_uid ON coin_ledger(uid, created_at);
