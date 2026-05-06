-- SETTINGS
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- SITE CONFIG
INSERT INTO settings (key, value) VALUES
('site_name', 'AZURA'),
('version', 'v1'),
('maintenance', 'false');

-- DEFAULT BANNER
INSERT INTO banners (id, title, image, link, active)
VALUES ('default', 'Welcome', '/assets/bg.jpg', '/', 1);