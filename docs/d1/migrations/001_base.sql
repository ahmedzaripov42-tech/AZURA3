-- USERS
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch())
);

-- MANGA / MANHWA
CREATE TABLE manga (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  status TEXT DEFAULT 'ongoing',
  cover TEXT,
  rating REAL DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- CHAPTERS
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  manga_id TEXT,
  title TEXT,
  number INTEGER,
  content_type TEXT DEFAULT 'images',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (manga_id) REFERENCES manga(id)
);

-- CHAPTER PAGES
CREATE TABLE chapter_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id TEXT,
  page_url TEXT,
  page_number INTEGER,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);

-- COMMENTS
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  manga_id TEXT,
  content TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);