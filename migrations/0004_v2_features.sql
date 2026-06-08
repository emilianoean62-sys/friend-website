-- ============================================================
-- V2 Features: profiles, chat, friends, notifications, image fixes
-- ============================================================

-- PROFILES (Netflix-style multiple profiles per user)
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  banner TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  is_kids INTEGER DEFAULT 0,
  theme TEXT DEFAULT 'default', -- default, sakura, neon, midnight, vip
  pin TEXT DEFAULT '', -- optional 4-digit PIN
  is_main INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

-- Add profile_id to watch_history for per-profile tracking
ALTER TABLE watch_history ADD COLUMN profile_id INTEGER REFERENCES profiles(id);
ALTER TABLE favorites ADD COLUMN profile_id INTEGER REFERENCES profiles(id);

-- CHAT CHANNELS
CREATE TABLE IF NOT EXISTS chat_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'fa-hashtag',
  required_role TEXT DEFAULT 'USER', -- USER | PREMIUM | VIP | ADMIN
  locked INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  profile_id INTEGER,
  content TEXT NOT NULL,
  attachment_url TEXT DEFAULT '',
  attachment_type TEXT DEFAULT '', -- image | gif
  reply_to INTEGER,
  pinned INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_to) REFERENCES chat_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_id, created_at DESC);

-- CHAT REACTIONS
CREATE TABLE IF NOT EXISTS chat_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(message_id, user_id, emoji)
);

-- ONLINE PRESENCE (heartbeat-based, no websocket)
CREATE TABLE IF NOT EXISTS chat_presence (
  user_id INTEGER PRIMARY KEY,
  channel_id INTEGER,
  typing INTEGER DEFAULT 0,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON chat_presence(last_seen);

-- USER TIMEOUTS / MUTES
CREATE TABLE IF NOT EXISTS chat_mutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  muted_until DATETIME NOT NULL,
  reason TEXT DEFAULT '',
  by_admin INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- FRIENDS
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING | ACCEPTED | BLOCKED
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, friend_id)
);

-- Add Shadow@gmail.com as ADMIN
-- Password: Shadow123
INSERT INTO users (email, username, password_hash, role) VALUES
('shadow@gmail.com', 'Shadow', 'qbOglXTRlkufQw6KYz47VQ.CN3PduT7GAvM2ZLtu17Mr72aafRIp9rkD5CNtsrQ7ig', 'ADMIN');

-- Seed chat channels
INSERT INTO chat_channels (slug, name, description, icon, required_role, sort_order) VALUES
('global', 'Global Chat', 'Talk about anything anime with the whole community', 'fa-globe', 'USER', 0),
('discussion', 'Anime Discussion', 'Deep dives, theories, and debates', 'fa-comments', 'USER', 1),
('reactions', 'Episode Reactions', 'Live reactions to new episodes', 'fa-fire', 'USER', 2),
('recommendations', 'Recommendations', 'What should I watch next?', 'fa-lightbulb', 'USER', 3),
('premium-lounge', 'Premium Lounge', 'Members-only chill zone', 'fa-crown', 'PREMIUM', 4),
('vip-lounge', 'VIP Lounge', 'The exclusive club', 'fa-gem', 'VIP', 5);

-- Default profile for each existing user
INSERT INTO profiles (user_id, name, avatar, is_main)
SELECT id, username, '', 1 FROM users WHERE id NOT IN (SELECT user_id FROM profiles);
