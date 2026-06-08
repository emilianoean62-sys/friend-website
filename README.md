# AniVerse — Cinematic Anime Streaming Platform

> A production-ready anime streaming web app with dark cinematic UI, Free / Premium / VIP tiers, multi-profile system (Netflix-style), Discord-style community chat, friends, admin panel, and a massive HLS video player.

![Stack](https://img.shields.io/badge/Hono-Edge-orange?style=flat-square)
![D1](https://img.shields.io/badge/Cloudflare-D1-blue?style=flat-square)
![TS](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square)

---

## 🌐 Live URL

- **Local development**: http://localhost:3000
- **Sandbox preview**: `https://3000-<sandbox-id>.sandbox.novita.ai`

## 🔑 Demo Accounts

| Role        | Email                     | Password    | Use for                                       |
|-------------|---------------------------|-------------|-----------------------------------------------|
| **Admin**   | `admin@aniverse.app`      | `admin123`  | Full admin panel access, anime CRUD, users    |
| **Admin**   | `shadow@gmail.com`        | `Shadow123` | Second admin account (Shadow)                 |
| **Premium** | `premium@aniverse.app`    | `demo123`   | Pre-loaded Premium account                    |
| **Free**    | `demo@aniverse.app`       | `demo123`   | Test locked content + upgrade flow            |

You can also self-register a new free account via `/register`.

---

## ✨ Features Implemented

### 🎨 Frontend (Cinematic UI)
- Dark cinematic theme with orange/violet glows and animated particles
- Custom Tailwind palette (`av-bg`, `av-orange`, `av-vip`, `av-gold`)
- Bebas Neue display font + Inter body
- Auto-playing hero slider with fade transitions and dot navigation
- Scroll-aware glassmorphic navbar
- Lock overlays with pulse animation for premium content
- Tilt-card hover effects, fade-in-on-scroll, animated dots, glow shadows
- Mobile bottom-nav (5 tabs), full responsive
- Custom Video.js theme with orange playback bar

### 🔐 Authentication (Web-Crypto JWT, no Node deps)
- Email + password register / login
- PBKDF2 password hashing (100 000 iterations, Web Crypto API)
- HS256 JWT in HttpOnly Secure SameSite=Lax cookie
- Premium expiry auto-downgrade on every request
- Role enforcement (USER / PREMIUM / VIP / ADMIN)
- `requireAuth` and `requireAdmin` middleware

### 👥 V2 — Multi-Profile System (Netflix-Style)
- `GET /profiles` — animated profile selector ("Who's Watching?")
- Add / edit / delete profiles with 12 curated DiceBear avatars + custom URL
- 5 themes: Classic, Sakura, Neon, Midnight, **VIP Gold** (animated rainbow border, premium-only)
- Kids profile mode with blue border + KIDS tag
- 4-digit PIN protection (modal unlock)
- Profile limits: Free 2 · Premium 4 · VIP 6 · Admin 10
- Profile cookie (`aniverse_profile`) scopes watch history & favorites
- Premium animated borders, glow effects, VIP rainbow shimmer

### 💬 V2 — Discord-Style Community Chat
- **6 channels seeded**: `global`, `discussion`, `reactions`, `recommendations`, `premium-lounge` (PREMIUM+), `vip-lounge` (VIP+)
- Real-time updates via 2-second polling with `?after=lastId` cursor (Workers-safe alternative to true SSE)
- Heartbeat-based online presence (last_seen > -2 minutes)
- Live typing indicators throttled every 3s
- Emoji reactions (30 curated emojis, unique constraint per user/message)
- GIF / image URL paste with attachment preview
- Role badges in chat: ADMIN (red shield), VIP (purple gem pulsing), PREMIUM (orange crown)
- Bad-word filter (replaces with `***`)
- Profile-aware author display (shows profile name + avatar when active)
- Admin moderation:
  - Mute users 10 min / 24 h / custom
  - Pin / unpin messages (with golden border)
  - Lock / unlock channels
  - Create / delete channels
  - Delete any message
- Pinned messages have orange left border
- Soft-delete (shows `[deleted]` placeholder)

### 🤝 V2 — Friend System
- `GET /friends` — incoming + sent + accepted lists
- Add friend by username or email
- Accept / decline / cancel / unfriend
- Friend cards show role-colored avatar borders
- Auto-creates notifications on request + accept

### 🔔 V2 — Notifications
- Bell icon in navbar with pulsing red dot for unread
- 360px panel with last 50 notifications
- "Mark all read" + per-row click marks individually
- Polls every 30 s in background
- Currently fires on: friend request received, friend request accepted

### 🎬 V2 — Massive Cinematic Video Player
- 100% wide HLS player with Video.js + hls.js
- **Theater mode** (T) — full viewport width, hides sidebar
- **Fullscreen** (F) — native fullscreen
- **Picture-in-Picture** (P) — floating mini-player
- Keyboard shortcuts: Space, ←/→ (skip 10s), ↑/↓ (volume ±5%), M (mute)
- **Skip Intro** button auto-appears 5s–85s (configurable)
- **Up Next** card slides in last 30s with one-click play
- Resume from last position (saved every 6s)
- Auto-advance to next episode on end
- Custom overlay controls (Theater · PiP · Fullscreen)
- Quick favorite + chat-discuss buttons
- Visible keyboard shortcut hint
- 6 playback speeds (0.5× → 2×)

### 🎭 Anime Catalog
- 12 seeded anime titles + Shadow admin's content
- TMDB image CDN posters/banners with onerror fallback to placehold.co
- Genres, year, rating, views, status, type (TV/Movie/OVA)
- Premium / VIP / Featured / Trending / Free flags
- Carousel sections on home: Continue Watching · Trending · Popular · Newest · Top Rated · Premium
- Browse with filters: q/genre/year/sort
- Anime details: cinematic banner + poster + synopsis + episodes list + comments + related

### 🎫 Membership
- Mock Stripe-style checkout (`POST /api/membership/checkout`)
- PREMIUM $9.99 / 30 days, VIP $19.99 / 30 days
- Sets `premium_until` and role automatically
- Payments table records every transaction

### ⚙️ Admin Panel
- Dashboard with stat cards (users · anime · payments · comments)
- Anime CRUD with **live URL preview** on poster/banner inputs
- Episode management with `is_free` toggle
- User role editor + ban toggle
- Hero slide management (active/inactive sort order)
- Comment moderation
- **NEW**: Chat moderation — channels, mutes, message pin/delete/mute-user

### 🖼️ Image System
- All AnimeCard posters have automatic onerror fallback (placehold.co with title)
- Live preview on admin URL inputs (poster + banner)
- URL validation endpoint (`POST /api/admin/upload/validate`) — R2 binding stub
- Profile avatar grid + custom URL paste

---

## 📍 URI Reference

### Public Pages
| Method | Path                     | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/`                      | Home with hero + 6 carousels         |
| GET    | `/browse?q=&genre=&year=&sort=` | Filtered catalog              |
| GET    | `/trending`              | Top trending anime                   |
| GET    | `/search?q=`             | Search                               |
| GET    | `/anime/:slug`           | Anime detail page                    |
| GET    | `/watch/:slug/:number`   | Cinematic player                     |
| GET    | `/membership`            | Pricing tiers (Free/Premium/VIP)     |
| GET    | `/login`, `/register`    | Auth pages                           |

### Authenticated Pages
| Method | Path                     | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/profile`               | Account page                         |
| GET    | `/profiles`              | **Netflix-style selector**           |
| GET    | `/profiles/new`          | Create profile                       |
| GET    | `/profiles/:id/edit`     | Edit profile                         |
| GET    | `/profiles/manage`       | Manage all profiles                  |
| GET    | `/chat` → `/chat/global` | Chat redirect                        |
| GET    | `/chat/:slug`            | Channel UI (Discord-style)           |
| GET    | `/friends`               | Friend system                        |

### Admin Pages
| Method | Path                     | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/admin`                 | Dashboard                            |
| GET    | `/admin/anime`           | Anime list + CRUD                    |
| GET    | `/admin/anime/new`       | New anime form (with live preview)   |
| GET    | `/admin/anime/:id/edit`  | Edit anime                           |
| GET    | `/admin/anime/:id/episodes` | Episode manager                   |
| GET    | `/admin/users`           | User mgmt                            |
| GET    | `/admin/hero`            | Hero slider mgmt                     |
| GET    | `/admin/comments`        | Comment moderation                   |
| GET    | `/admin/chat`            | **Chat moderation panel**            |

### Public API (JSON)
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| GET    | `/api/anime?q=&genre=&year=&sort=&limit=` | List anime         |
| GET    | `/api/anime/:slug`                | Anime detail + episodes    |

### Auth API
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| POST   | `/api/auth/register`              | `{ email, username, password }` |
| POST   | `/api/auth/login`                 | `{ email, password }`      |
| POST   | `/api/auth/logout`                | Clears cookie              |
| GET    | `/api/auth/me`                    | Current session            |

### User API (auth required)
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| POST   | `/api/user/favorites/toggle`      | `{ anime_id }`             |
| POST   | `/api/user/watch/progress`        | `{ anime_id, episode_id, progress, total }` (writes profile_id) |
| POST   | `/api/user/comments`              | `{ anime_id, content }`    |
| PUT    | `/api/user/profile/avatar`        | `{ avatar }`               |

### Membership API
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| POST   | `/api/membership/checkout`        | Mock Stripe, `{ plan: PREMIUM\|VIP }` |

### Admin API (auth + ADMIN required)
| Method | Path                                   | Description           |
|--------|----------------------------------------|-----------------------|
| POST   | `/api/admin/anime`                     | Create anime          |
| PUT    | `/api/admin/anime/:id`                 | Update anime          |
| DELETE | `/api/admin/anime/:id`                 | Delete anime          |
| POST   | `/api/admin/episodes`                  | Create episode        |
| PUT    | `/api/admin/episodes/:id`              | Update episode        |
| DELETE | `/api/admin/episodes/:id`              | Delete episode        |
| POST   | `/api/admin/episodes/:id/toggle-free`  | Toggle free flag      |
| POST   | `/api/admin/users/:id/role`            | Set role + premium_until |
| POST   | `/api/admin/users/:id/ban`             | Toggle ban            |
| POST   | `/api/admin/hero`                      | Create hero slide     |
| DELETE | `/api/admin/hero/:id`                  | Delete slide          |
| DELETE | `/api/admin/comments/:id`              | Delete comment        |
| POST   | `/api/admin/upload/validate`           | URL validate (R2 stub)|

### Profiles API
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| GET    | `/api/profiles`                   | List my profiles           |
| POST   | `/api/profiles`                   | Create (with limit check)  |
| PUT    | `/api/profiles/:id`               | Update                     |
| DELETE | `/api/profiles/:id`               | Delete (blocks main)       |
| POST   | `/api/profiles/:id/select`        | Set active (PIN-checked)   |

### Chat API
| Method | Path                                       | Description                  |
|--------|--------------------------------------------|------------------------------|
| GET    | `/api/chat/channels`                       | All channels + accessible flag |
| GET    | `/api/chat/channels/:slug/messages?after=`| Messages w/ reactions        |
| POST   | `/api/chat/channels/:slug/messages`        | Send message                 |
| DELETE | `/api/chat/messages/:id`                   | Soft-delete                  |
| POST   | `/api/chat/messages/:id/pin`               | Admin pin/unpin              |
| POST   | `/api/chat/messages/:id/react`             | Toggle emoji reaction        |
| POST   | `/api/chat/channels/:slug/typing`          | Typing indicator             |
| GET    | `/api/chat/channels/:slug/online`          | Online users                 |
| POST   | `/api/chat/heartbeat`                      | Presence keepalive           |
| POST   | `/api/chat/admin/mute`                     | Admin mute `{ user_id, minutes }` |
| POST   | `/api/chat/admin/channels`                 | Create channel               |
| DELETE | `/api/chat/admin/channels/:id`             | Delete channel               |
| POST   | `/api/chat/admin/channels/:id/lock`        | Toggle lock                  |

### Friends API
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| GET    | `/api/friends`                    | Accepted + incoming + sent |
| POST   | `/api/friends/request`            | `{ target }` username/email|
| POST   | `/api/friends/accept/:id`         | Accept request             |
| POST   | `/api/friends/decline/:id`        | Decline / cancel           |
| DELETE | `/api/friends/:friendId`          | Unfriend                   |
| GET    | `/api/friends/user/:id`           | Public profile lookup      |

### Notifications API
| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| GET    | `/api/notifications`              | Last 50 + unread count     |
| POST   | `/api/notifications/read-all`     | Mark all read              |
| POST   | `/api/notifications/:id/read`     | Mark one read              |

---

## 🗂️ Data Architecture

**Database**: Cloudflare D1 (SQLite) — local development at `.wrangler/state/v3/d1`

### Core Tables
- `users` — auth, roles, premium_until, banned
- `anime` — title, slug, poster, banner, genres, premium/vip flags
- `episodes` — per-anime ordered by `number`, with HLS video_url
- `watch_history` — per-user per-episode progress + completed (now has `profile_id`)
- `favorites` — user+anime UNIQUE (now has `profile_id`)
- `watchlist` — alternative collection
- `comments` — per-anime threaded
- `payments` — mock Stripe records
- `hero_slides` — admin-managed homepage slider
- `notifications` — title/message/link/read

### V2 Tables
- `profiles` — multi-profile (user_id, name, avatar, banner, theme, pin, is_kids, is_main)
- `chat_channels` — slug, required_role, icon, locked
- `chat_messages` — channel_id, user_id, profile_id, attachment, reply_to, pinned, deleted
- `chat_reactions` — message_id, user_id, emoji UNIQUE
- `chat_presence` — user_id PK, channel_id, typing, last_seen
- `chat_mutes` — user_id, muted_until, reason, by_admin
- `friends` — user_id, friend_id, status (PENDING/ACCEPTED/BLOCKED)

---

## 🛠️ Tech Stack

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Runtime      | **Cloudflare Workers / Pages Edge**             |
| Framework    | **Hono 4** with `jsxRenderer` SSR               |
| Database     | **Cloudflare D1** (SQLite at the edge)          |
| Auth         | Web Crypto JWT (HS256) + PBKDF2 hashing         |
| Frontend     | TailwindCSS CDN + vanilla JS (no React/Vue)     |
| Video        | **Video.js 8** + **hls.js 1.5**                 |
| Icons        | Font Awesome 6                                  |
| Fonts        | Inter + Bebas Neue (Google)                     |
| Build        | **Vite 6** + `@hono/vite-cloudflare-pages`      |
| Dev server   | **PM2** managing `wrangler pages dev`           |

---

## 🚀 Running Locally

```bash
# 1. Apply migrations
npx wrangler d1 migrations apply aniverse-production --local

# 2. Build
npm run build

# 3. Clean port + start with PM2
fuser -k 3000/tcp 2>/dev/null || true
pm2 start ecosystem.config.cjs

# 4. View at http://localhost:3000
curl http://localhost:3000
```

---

## 📝 Not Yet Implemented (Future Work)

- ❌ Real Stripe integration (currently mock)
- ❌ R2 object storage for image uploads (URL paste works; R2 stub exists)
- ❌ Email notifications (SendGrid/Resend)
- ❌ True WebSocket-based chat (current 2 s polling is intentional for Workers)
- ❌ Server-Sent Events (workers memory model not ideal for long-lived streams)
- ❌ OAuth login (Google/Discord) — only email/password
- ❌ Subtitles / multi-language tracks
- ❌ Adaptive bitrate selection UI
- ❌ Mobile apps (web-only)
- ❌ Comment threads/replies (single-level only)

## ✅ Deployment

- **Platform**: Cloudflare Pages
- **Status**: ✅ Local dev active. Production deploy via `npx wrangler pages deploy dist --project-name aniverse`
- **Last Updated**: 2026-05-23

## 📂 Project Structure

```
webapp/
├── migrations/
│   ├── 0001_initial_schema.sql    # 10 core tables
│   ├── 0002_seed.sql              # 12 anime + 22 episodes + 4 slides
│   ├── 0003_seed_users.sql        # admin/demo/premium accounts
│   └── 0004_v2_features.sql       # profiles, chat, friends, Shadow admin
├── public/static/
│   ├── style.css                  # 1098 lines cinematic CSS
│   ├── app.js                     # Vanilla JS (nav, modals, toasts, notifs)
│   ├── chat.js                    # Chat polling + emoji + reactions
│   └── favicon.svg
├── src/
│   ├── index.tsx                  # All page routes (1800+ lines)
│   ├── renderer.tsx               # jsxRenderer + Navbar + Footer
│   ├── lib/
│   │   ├── auth.ts                # JWT + PBKDF2 + middleware
│   │   └── types.ts               # TypeScript types
│   ├── pages/components.tsx       # AnimeCard, CarouselSection
│   └── routes/
│       ├── api-auth.ts
│       ├── api-anime.ts
│       ├── api-user.ts
│       ├── api-membership.ts
│       ├── api-admin.ts           # + R2 upload stub
│       ├── api-profiles.ts        # NEW (V2)
│       ├── api-chat.ts            # NEW (V2)
│       ├── api-friends.ts         # NEW (V2)
│       └── api-notifications.ts   # NEW (V2)
├── wrangler.jsonc                 # D1 binding
├── vite.config.ts                 # Vite + Hono Pages plugin
├── ecosystem.config.cjs           # PM2 config
└── package.json
```

---

**Built with ⚡ on Cloudflare Edge. JWT auth + D1 SQL + polling-based real-time. Zero server cost, infinite scale.**
