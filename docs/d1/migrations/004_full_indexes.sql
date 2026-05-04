-- Migration 004: indexes for full schema (run after 003)

CREATE INDEX IF NOT EXISTS idx_manhwa_updated ON manhwa(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_manhwa_views ON manhwa(views DESC);
CREATE INDEX IF NOT EXISTS idx_manhwa_adult ON manhwa(is_adult);

CREATE INDEX IF NOT EXISTS idx_pages_chapter ON chapter_pages(chapter_id, page_no);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_ratings_manhwa ON ratings(manhwa_id);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_manhwa ON comments(manhwa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_notifications_uid ON notifications(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(uid, read_flag);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_uid ON coin_ledger(uid, created_at DESC);
