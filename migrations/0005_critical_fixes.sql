-- ============================================================
-- 0005 CRITICAL FIXES
--  - Permanent admin role for shadow@gmail.com
--  - is_admin & membership_type columns for fast role checks
--  - Lifetime / forever memberships (premium_until far in the future)
--  - Real anime sample data with TMDB image URLs
--  - File upload metadata table
-- ============================================================

-- 1) Add is_admin flag (defaults to 0; locked-in for admin emails)
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

-- 2) Add membership_type — canonical source of truth (FREE | PREMIUM | VIP)
--    Separate from role so admins keep ADMIN role + can also be VIP
ALTER TABLE users ADD COLUMN membership_type TEXT NOT NULL DEFAULT 'FREE';

-- 3) Backfill from existing role
UPDATE users SET is_admin = 1 WHERE role = 'ADMIN';
UPDATE users SET membership_type = role WHERE role IN ('PREMIUM','VIP');

-- 4) Ensure shadow@gmail.com is permanent ADMIN
--    (idempotent — works whether row exists or not)
UPDATE users SET role = 'ADMIN', is_admin = 1, membership_type = 'VIP',
       premium_until = '2099-12-31T23:59:59Z', banned = 0
WHERE LOWER(email) = 'shadow@gmail.com';

-- 5) Lock-in known admin emails — anyone with these emails is auto-admin
CREATE TABLE IF NOT EXISTS admin_emails (
  email TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO admin_emails (email) VALUES ('shadow@gmail.com');

-- 6) File uploads metadata (for /api/admin/uploads listing — actual bytes go to R2)
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'other', -- video | image | other
  url TEXT NOT NULL, -- public URL (R2 or external)
  storage TEXT NOT NULL DEFAULT 'external', -- r2 | external
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_kind ON uploads(kind);

-- 7) Real-anime seed (TMDB/AniList-style with real titles + working image URLs)
--    Using anilist CDN + tmdb public images (license-free for streaming demos)
INSERT OR IGNORE INTO anime (slug, title, description, poster, banner, trailer, genres, status, release_year, rating, studio, type, is_premium, is_vip, is_featured, is_trending) VALUES
('frieren-beyond-journeys-end',
 'Frieren: Beyond Journey''s End',
 'After 80 years apart, the elf mage Frieren sets out to honor her late companions by truly understanding humanity.',
 'https://image.tmdb.org/t/p/w500/dqZENchTd7lp5zht7BdlqM7RBhD.jpg',
 'https://image.tmdb.org/t/p/original/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg',
 'https://www.youtube.com/embed/0SwO35t6_oc',
 'Adventure,Drama,Fantasy', 'COMPLETED', 2023, 9.4, 'Madhouse', 'TV', 0, 0, 1, 1),

('jujutsu-kaisen',
 'Jujutsu Kaisen',
 'Yuji Itadori swallows a cursed finger to save his friends, becoming the host of the legendary curse Sukuna.',
 'https://image.tmdb.org/t/p/w500/fHpKWq9ayzSk8nSwqRuaAUemRKh.jpg',
 'https://image.tmdb.org/t/p/original/eTUDvFCAceK2BVw8DJSJWAFkqND.jpg',
 'https://www.youtube.com/embed/4A_X-Dvl0ws',
 'Action,Supernatural,School', 'ONGOING', 2020, 8.7, 'MAPPA', 'TV', 0, 0, 1, 1),

('demon-slayer',
 'Demon Slayer: Kimetsu no Yaiba',
 'A young man becomes a demon slayer to avenge his family and turn his demon-cursed sister human again.',
 'https://image.tmdb.org/t/p/w500/wrCVHdkBlBWdJUZPvnJWcBRuhSY.jpg',
 'https://image.tmdb.org/t/p/original/nTvM4mhqNlHIvUkI1gVnW6XP7GG.jpg',
 'https://www.youtube.com/embed/VQGCKyvzIM4',
 'Action,Historical,Supernatural', 'ONGOING', 2019, 8.5, 'Ufotable', 'TV', 0, 0, 1, 1),

('attack-on-titan',
 'Attack on Titan',
 'Humans live behind massive walls to defend against man-eating Titans — until a Colossal Titan breaches their world.',
 'https://image.tmdb.org/t/p/w500/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg',
 'https://image.tmdb.org/t/p/original/8OZ3VqHQ5Q1JTPYxC0ksLGZuVTw.jpg',
 'https://www.youtube.com/embed/MGRm4IzK1SQ',
 'Action,Drama,Mystery', 'COMPLETED', 2013, 9.1, 'Wit Studio / MAPPA', 'TV', 0, 0, 1, 1),

('one-piece',
 'One Piece',
 'Monkey D. Luffy and his pirate crew sail the Grand Line in search of the legendary treasure One Piece.',
 'https://image.tmdb.org/t/p/w500/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg',
 'https://image.tmdb.org/t/p/original/yLDIwS6XBkfvN4FGqA8GeNJEEsi.jpg',
 'https://www.youtube.com/embed/S8_YwFLCh4U',
 'Action,Adventure,Comedy', 'ONGOING', 1999, 9.2, 'Toei Animation', 'TV', 0, 0, 1, 1),

('chainsaw-man',
 'Chainsaw Man',
 'Denji merges with his pet devil Pochita to become Chainsaw Man — a devil hunter in a world ruled by fear.',
 'https://image.tmdb.org/t/p/w500/npdB6eFzizki0WaZ1OvKcJrWe97.jpg',
 'https://image.tmdb.org/t/p/original/1Ej2RofiKRZbCt8R98qN3LjpDLh.jpg',
 'https://www.youtube.com/embed/dFlDRhvM4L0',
 'Action,Horror,Supernatural', 'ONGOING', 2022, 8.6, 'MAPPA', 'TV', 0, 0, 1, 1),

('spy-x-family',
 'Spy x Family',
 'A spy, an assassin, and a telepath form a fake family — none of them know each other''s secrets.',
 'https://image.tmdb.org/t/p/w500/aoaiUws3vjnHfBnxAvA75ON3GhU.jpg',
 'https://image.tmdb.org/t/p/original/i5fT7yIs7pVwfsfNHzAyrCWarcg.jpg',
 'https://www.youtube.com/embed/ofXigq9aIpo',
 'Action,Comedy,Slice of Life', 'ONGOING', 2022, 8.8, 'Wit Studio / CloverWorks', 'TV', 0, 0, 1, 1),

('your-name',
 'Your Name (Kimi no Na wa)',
 'Two teenagers find themselves mysteriously swapping bodies across time and space.',
 'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg',
 'https://image.tmdb.org/t/p/original/mMtUybQ6hL24FXo0F3Z4j2KG7kZ.jpg',
 'https://www.youtube.com/embed/xU47nhruN-Q',
 'Romance,Drama,Supernatural', 'COMPLETED', 2016, 8.4, 'CoMix Wave', 'MOVIE', 1, 0, 1, 0),

('vinland-saga',
 'Vinland Saga',
 'Driven by revenge, young Thorfinn joins a band of Vikings — only to discover the true cost of war.',
 'https://image.tmdb.org/t/p/w500/yPpiE3VYM3GFxKBJfqOQQJLeNDh.jpg',
 'https://image.tmdb.org/t/p/original/8aogkjGQpUiVfDl9c4SiV7Q4S1u.jpg',
 'https://www.youtube.com/embed/L_E5HCa9Kfk',
 'Action,Drama,Historical', 'ONGOING', 2019, 8.9, 'Wit Studio / MAPPA', 'TV', 1, 0, 1, 0),

('cyberpunk-edgerunners',
 'Cyberpunk: Edgerunners',
 'In a tech-and-body-modification-obsessed Night City, a street kid becomes an edgerunner — a mercenary outlaw.',
 'https://image.tmdb.org/t/p/w500/jaJDxLOvUuT4mYQDPNlPOAqfeRY.jpg',
 'https://image.tmdb.org/t/p/original/c5ag28BBoFHQT0RaWUUtljNYxod.jpg',
 'https://www.youtube.com/embed/0Sg2VTvAeJI',
 'Action,Sci-Fi,Drama', 'COMPLETED', 2022, 8.6, 'Trigger', 'TV', 0, 1, 1, 0),

('mob-psycho-100',
 'Mob Psycho 100',
 'A timid middle-schooler with overwhelming psychic powers tries to live a normal life.',
 'https://image.tmdb.org/t/p/w500/cAlPgBhBNFLAR59vKYbsyzqDLZE.jpg',
 'https://image.tmdb.org/t/p/original/i6FWBFCMcmpTjOR9NfQTC65Z2VW.jpg',
 'https://www.youtube.com/embed/QtZSwvHvI4Q',
 'Action,Comedy,Supernatural', 'COMPLETED', 2016, 8.7, 'Bones', 'TV', 0, 0, 0, 1),

('death-note',
 'Death Note',
 'A brilliant student finds a notebook that kills anyone whose name is written in it.',
 'https://image.tmdb.org/t/p/w500/g8hHbsRWGgaKW1Lg76FrG1qfsKr.jpg',
 'https://image.tmdb.org/t/p/original/dF2zg7ZRl4yclVCYpaNI4ED4Pqv.jpg',
 'https://www.youtube.com/embed/NlJZ-YgAt-c',
 'Mystery,Psychological,Supernatural', 'COMPLETED', 2006, 9.0, 'Madhouse', 'TV', 0, 0, 0, 0);

-- Free preview episodes for each new anime (ep 1 is free, ep 2+ premium)
INSERT INTO episodes (anime_id, number, title, description, thumbnail, video_url, duration, is_free, is_premium)
SELECT a.id, 1, 'Episode 1 — ' || a.title, 'Pilot episode.',
       a.banner, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
       596, 1, 0
FROM anime a WHERE a.slug IN (
  'frieren-beyond-journeys-end','jujutsu-kaisen','demon-slayer','attack-on-titan',
  'one-piece','chainsaw-man','spy-x-family','your-name','vinland-saga',
  'cyberpunk-edgerunners','mob-psycho-100','death-note'
) AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.anime_id = a.id AND e.number = 1);

INSERT INTO episodes (anime_id, number, title, description, thumbnail, video_url, duration, is_free, is_premium)
SELECT a.id, 2, 'Episode 2 — ' || a.title, 'The journey continues.',
       a.banner, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
       653, 0, 1
FROM anime a WHERE a.slug IN (
  'frieren-beyond-journeys-end','jujutsu-kaisen','demon-slayer','attack-on-titan',
  'one-piece','chainsaw-man','spy-x-family','your-name','vinland-saga',
  'cyberpunk-edgerunners','mob-psycho-100','death-note'
) AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.anime_id = a.id AND e.number = 2);

INSERT INTO episodes (anime_id, number, title, description, thumbnail, video_url, duration, is_free, is_premium)
SELECT a.id, 3, 'Episode 3 — ' || a.title, 'Things heat up.',
       a.banner, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
       596, 0, 1
FROM anime a WHERE a.slug IN (
  'frieren-beyond-journeys-end','jujutsu-kaisen','demon-slayer','attack-on-titan',
  'one-piece','chainsaw-man','spy-x-family','your-name','vinland-saga',
  'cyberpunk-edgerunners','mob-psycho-100','death-note'
) AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.anime_id = a.id AND e.number = 3);

-- Refresh hero slides with new anime
DELETE FROM hero_slides;
INSERT INTO hero_slides (anime_id, title, subtitle, image, cta_text, cta_link, sort_order, active)
SELECT a.id, a.title, a.description, a.banner, 'Watch Now', '/anime/' || a.slug, ROW_NUMBER() OVER (ORDER BY a.rating DESC) - 1, 1
FROM anime a
WHERE a.is_featured = 1 AND a.banner IS NOT NULL AND a.banner != ''
ORDER BY a.rating DESC LIMIT 6;
