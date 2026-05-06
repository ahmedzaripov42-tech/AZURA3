-- BANNERS
CREATE TABLE banners (
  id TEXT PRIMARY KEY,
  title TEXT,
  image TEXT,
  link TEXT,
  active INTEGER DEFAULT 1
);

-- FAVORITES
CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  manga_id TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- HISTORY (reader tracking)
CREATE TABLE history (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  manga_id TEXT,
  chapter_id TEXT,
  progress INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- PREMIUM USERS
CREATE TABLE premium (
  user_id TEXT PRIMARY KEY,
  expires_at INTEGER,
  plan TEXT
);

-- ADMINS LOG
CREATE TABLE admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  action TEXT,
  target TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);