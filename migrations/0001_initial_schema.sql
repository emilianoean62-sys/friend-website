-- AniVerse Database Schema

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'USER', -- USER | PREMIUM | VIP | ADMIN
  premium_until DATETIME,
  banned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ANIME
CREATE TABLE IF NOT EXISTS anime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  poster TEXT,         -- thumbnail/poster URL
  banner TEXT,         -- hero banner URL
  trailer TEXT,        -- youtube/mp4/hls URL
  genres TEXT,         -- comma-separated
  status TEXT DEFAULT 'ONGOING', -- ONGOING | COMPLETED | UPCOMING
  release_year INTEGER,
  rating REAL DEFAULT 0,
  views INTEGER DEFAULT 0,
  is_premium INTEGER DEFAULT 0, -- 1 = premium-only anime
  is_vip INTEGER DEFAULT 0,     -- 1 = vip exclusive
  is_featured INTEGER DEFAULT 0,
  is_trending INTEGER DEFAULT 0,
  studio TEXT,
  type TEXT DEFAULT 'TV', -- TV | MOVIE | OVA
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anime_slug ON anime(slug);
CREATE INDEX IF NOT EXISTS idx_anime_featured ON anime(is_featured);
CREATE INDEX IF NOT EXISTS idx_anime_trending ON anime(is_trending);

-- EPISODES
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  thumbnail TEXT,
  video_url TEXT,        -- HLS m3u8 URL or mp4
  duration INTEGER DEFAULT 0, -- seconds
  is_free INTEGER DEFAULT 0,  -- 1 = free preview for free users
  is_premium INTEGER DEFAULT 1,
  release_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episodes_anime ON episodes(anime_id);

-- WATCH HISTORY / CONTINUE WATCHING
CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  anime_id INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  progress_seconds INTEGER DEFAULT 0,
  total_seconds INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  UNIQUE(user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_history(user_id);

-- FAVORITES
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  anime_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
  UNIQUE(user_id, anime_id)
);

-- WATCHLIST (different from favorites - "plan to watch")
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  anime_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
  UNIQUE(user_id, anime_id)
);

-- COMMENTS
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  anime_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
);

-- PAYMENTS / MEMBERSHIPS
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL, -- PREMIUM | VIP
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'COMPLETED', -- PENDING | COMPLETED | FAILED
  duration_days INTEGER DEFAULT 30,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- HERO SLIDER
CREATE TABLE IF NOT EXISTS hero_slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER,
  title TEXT NOT NULL,
  subtitle TEXT,
  image TEXT NOT NULL,
  cta_text TEXT DEFAULT 'Watch Now',
  cta_link TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE SET NULL
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
