-- ============================================================
-- 0006 COMPLETE PLATFORM FIX
--  - permissions column (JSON array text) for fine-grained ACL
--  - seasons table for season-level management
--  - refresh_tokens table for refresh-token rotation support
--  - emilianoean62@gmail.com as permanent ADMIN (password proboyy123@)
--  - Backfill anime missing poster/banner with real images
-- ============================================================

ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]';
UPDATE users SET permissions = '["*"]' WHERE is_admin = 1 OR role = 'ADMIN';

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  poster TEXT NOT NULL DEFAULT '',
  release_year INTEGER,
  episode_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(anime_id, number),
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_seasons_anime ON seasons(anime_id);

ALTER TABLE episodes ADD COLUMN season_id INTEGER;
ALTER TABLE episodes ADD COLUMN season_number INTEGER NOT NULL DEFAULT 1;

INSERT OR IGNORE INTO seasons (anime_id, number, title, episode_count)
SELECT a.id, 1, 'Season 1', (SELECT COUNT(*) FROM episodes e WHERE e.anime_id = a.id)
FROM anime a;

UPDATE episodes
SET season_id = (SELECT id FROM seasons WHERE seasons.anime_id = episodes.anime_id AND seasons.number = 1)
WHERE season_id IS NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);

INSERT OR IGNORE INTO admin_emails (email) VALUES ('emilianoean62@gmail.com');

UPDATE users
SET role = 'ADMIN', is_admin = 1, membership_type = 'VIP',
    premium_until = '2099-12-31T23:59:59Z', banned = 0,
    permissions = '["*"]',
    password_hash = 'IJ5Kv7ckKPHAyYxR32nGBQ.byb61UjDdpAAidnpbnsrMsA6DutgyLkbZiA8SyMPeds'
WHERE LOWER(email) = 'emilianoean62@gmail.com';

INSERT OR IGNORE INTO users (email, username, password_hash, role, is_admin, membership_type, premium_until, permissions)
VALUES (
  'emilianoean62@gmail.com', 'emiliano',
  'IJ5Kv7ckKPHAyYxR32nGBQ.byb61UjDdpAAidnpbnsrMsA6DutgyLkbZiA8SyMPeds',
  'ADMIN', 1, 'VIP', '2099-12-31T23:59:59Z', '["*"]'
);

INSERT OR IGNORE INTO profiles (user_id, name, avatar, is_main, is_kids)
SELECT id, username, COALESCE(avatar, ''), 1, 0
FROM users
WHERE LOWER(email) = 'emilianoean62@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = users.id);

UPDATE anime SET poster = 'https://image.tmdb.org/t/p/w500/dqZENchTd7lp5zht7BdlqM7RBhD.jpg'
  WHERE poster IS NULL OR poster = '';
UPDATE anime SET banner = poster
  WHERE banner IS NULL OR banner = '';
UPDATE anime SET trailer = 'https://www.youtube.com/embed/0SwO35t6_oc'
  WHERE trailer IS NULL OR trailer = '';
