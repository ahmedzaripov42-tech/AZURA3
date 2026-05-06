CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_history_user ON history(user_id);
CREATE INDEX idx_history_manga ON history(manga_id);
CREATE INDEX idx_premium_expires ON premium(expires_at);
CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id);