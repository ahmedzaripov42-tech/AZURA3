CREATE INDEX IF NOT EXISTS idx_library_uid_updated ON library(uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_uid_state ON library(uid, state);
CREATE INDEX IF NOT EXISTS idx_progress_uid_lastread ON reading_progress(uid, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_manhwa_no ON chapters(manhwa_id, chapter_no DESC);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media_assets(folder, created_at DESC);
