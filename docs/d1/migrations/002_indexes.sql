CREATE INDEX idx_manga_status ON manga(status);
CREATE INDEX idx_manga_views ON manga(views);
CREATE INDEX idx_chapters_manga_id ON chapters(manga_id);
CREATE INDEX idx_comments_manga_id ON comments(manga_id);
CREATE INDEX idx_users_email ON users(email);