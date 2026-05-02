-- AZURA D1 production schema. Apply before first deploy:
-- wrangler d1 migrations apply azura-db --remote

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT,
  email TEXT,
  password TEXT,
  role TEXT DEFAULT 'user',
  coins INTEGER DEFAULT 0,
  vip INTEGER DEFAULT 0,
  provider TEXT,
  avatar TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value TEXT,
  updatedAt INTEGER
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  manhwaId TEXT,
  title TEXT,
  chapterNo REAL,
  pages TEXT,
  accessType TEXT DEFAULT 'free',
  price INTEGER DEFAULT 0,
  vip INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',
  createdAt INTEGER,
  updatedAt INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS views (
  id TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  updatedAt INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  uid TEXT,
  role TEXT DEFAULT 'user',
  createdAt INTEGER,
  updatedAt INTEGER,
  expiresAt INTEGER
);

CREATE TABLE IF NOT EXISTS device_sessions (
  token TEXT PRIMARY KEY,
  uid TEXT,
  label TEXT,
  userAgent TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  expiresAt INTEGER
);

CREATE TABLE IF NOT EXISTS library_items (
  uid TEXT NOT NULL,
  manhwaId TEXT NOT NULL,
  state TEXT DEFAULT 'saved',
  favorite INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  lastChapterId TEXT,
  lastReadAt INTEGER DEFAULT 0,
  completedAt INTEGER DEFAULT 0,
  updatedAt INTEGER,
  extra TEXT,
  PRIMARY KEY(uid, manhwaId)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  uid TEXT,
  type TEXT,
  title TEXT,
  body TEXT,
  link TEXT,
  read INTEGER DEFAULT 0,
  createdAt INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS ratings (
  manhwaId TEXT NOT NULL,
  uid TEXT NOT NULL,
  rating REAL DEFAULT 0,
  createdAt INTEGER,
  updatedAt INTEGER,
  PRIMARY KEY(manhwaId, uid)
);

CREATE TABLE IF NOT EXISTS manhwa_likes (
  manhwaId TEXT NOT NULL,
  uid TEXT NOT NULL,
  createdAt INTEGER,
  PRIMARY KEY(manhwaId, uid)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  manhwaId TEXT,
  uid TEXT,
  body TEXT,
  likes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',
  createdAt INTEGER,
  updatedAt INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS comment_likes (
  commentId TEXT NOT NULL,
  uid TEXT NOT NULL,
  createdAt INTEGER,
  PRIMARY KEY(commentId, uid)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporterUid TEXT,
  targetType TEXT,
  targetId TEXT,
  reason TEXT,
  details TEXT,
  status TEXT DEFAULT 'open',
  resolverUid TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actorUid TEXT,
  action TEXT,
  targetType TEXT,
  targetId TEXT,
  meta TEXT,
  createdAt INTEGER
);

CREATE TABLE IF NOT EXISTS coin_history (
  id TEXT PRIMARY KEY,
  uid TEXT,
  kind TEXT,
  amount INTEGER DEFAULT 0,
  note TEXT,
  actorUid TEXT,
  createdAt INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  key TEXT,
  url TEXT,
  filename TEXT,
  mime TEXT,
  content_type TEXT,
  size INTEGER DEFAULT 0,
  folder TEXT,
  kind TEXT,
  status TEXT DEFAULT 'active',
  createdBy TEXT,
  created_by TEXT,
  createdAt INTEGER,
  created_at INTEGER,
  updatedAt INTEGER,
  updated_at INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS multipart_uploads (
  uploadId TEXT PRIMARY KEY,
  key TEXT,
  filename TEXT,
  folder TEXT,
  mime TEXT,
  size INTEGER DEFAULT 0,
  partSize INTEGER DEFAULT 0,
  partCount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'initiated',
  createdBy TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  completedAt INTEGER,
  mediaAssetId TEXT,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS multipart_upload_parts (
  uploadId TEXT NOT NULL,
  partNumber INTEGER NOT NULL,
  etag TEXT,
  size INTEGER DEFAULT 0,
  createdAt INTEGER,
  PRIMARY KEY(uploadId, partNumber)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_updated ON users(role, updatedAt);
CREATE INDEX IF NOT EXISTS idx_chapters_manhwa_no ON chapters(manhwaId, chapterNo, createdAt);
CREATE INDEX IF NOT EXISTS idx_chapters_status_manhwa ON chapters(status, manhwaId, updatedAt);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expiresAt);
CREATE INDEX IF NOT EXISTS idx_library_items_uid ON library_items(uid, updatedAt);
CREATE INDEX IF NOT EXISTS idx_notifications_uid ON notifications(uid, read, createdAt);
CREATE INDEX IF NOT EXISTS idx_comments_manhwa ON comments(manhwaId, status, createdAt);
CREATE INDEX IF NOT EXISTS idx_media_assets_status_folder ON media_assets(status, folder, createdAt);
CREATE INDEX IF NOT EXISTS idx_multipart_uploads_key ON multipart_uploads(key);
