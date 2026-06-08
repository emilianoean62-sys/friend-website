import { Hono } from 'hono'
import { renderer } from './renderer'
import type { Bindings, Variables } from './lib/types'
import { authMiddleware, requireAuth, requireAdmin } from './lib/auth'
import apiAuth from './routes/api-auth'
import apiAnime from './routes/api-anime'
import apiUser from './routes/api-user'
import apiMembership from './routes/api-membership'
import apiAdmin from './routes/api-admin'
import apiProfiles from './routes/api-profiles'
import apiChat from './routes/api-chat'
import apiFriends from './routes/api-friends'
import apiNotifications from './routes/api-notifications'
import { AnimeCard, CarouselSection } from './pages/components'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Global middleware
app.use('*', authMiddleware)
app.use(renderer)

// =================== API MOUNTS ===================
app.route('/api/auth', apiAuth)
app.route('/api/anime', apiAnime)
app.route('/api/user', apiUser)
app.route('/api/membership', apiMembership)
app.route('/api/admin', apiAdmin)
app.route('/api/profiles', apiProfiles)
app.route('/api/chat', apiChat)
app.route('/api/friends', apiFriends)
app.route('/api/notifications', apiNotifications)

// =====================================================
//  IMAGE PROXY — bypasses hotlink blocks (Pinterest, etc.)
//  Usage: <img src="/api/img-proxy?url=https://pinimg.com/..." />
// =====================================================
app.get('/api/img-proxy', async (c) => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'url required' }, 400)
  let target: URL
  try { target = new URL(url) } catch { return c.json({ error: 'Invalid URL' }, 400) }
  if (!['http:', 'https:'].includes(target.protocol)) {
    return c.json({ error: 'http(s) only' }, 400)
  }
  try {
    const resp = await fetch(target.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AniVerseBot/1.0)',
        'accept': 'image/*,*/*;q=0.8',
        'referer': target.origin + '/',
      },
      cf: { cacheTtl: 86400, cacheEverything: true } as any,
    } as any)
    if (!resp.ok) return c.json({ error: `HTTP ${resp.status}` }, 502)
    const ct = resp.headers.get('content-type') || 'image/jpeg'
    if (!ct.startsWith('image/')) return c.json({ error: 'Not an image' }, 400)
    return new Response(resp.body, {
      headers: {
        'content-type': ct,
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*',
      },
    })
  } catch (e: any) {
    return c.json({ error: e?.message || 'fetch failed' }, 502)
  }
})

// =====================================================
//  HOME PAGE
// =====================================================
app.get('/', async (c) => {
  const user = c.get('user') || null
  const db = c.env.DB

  const [heroR, trendingR, popularR, newestR, topRatedR, premiumR, continueR] = await Promise.all([
    db.prepare(
      `SELECT hs.*, a.slug as anime_slug FROM hero_slides hs
       LEFT JOIN anime a ON a.id = hs.anime_id
       WHERE hs.active = 1 ORDER BY hs.sort_order ASC LIMIT 6`
    ).all(),
    db.prepare(
      `SELECT * FROM anime WHERE is_trending = 1 ORDER BY views DESC LIMIT 12`
    ).all(),
    db.prepare(
      `SELECT * FROM anime ORDER BY views DESC LIMIT 12`
    ).all(),
    db.prepare(
      `SELECT * FROM anime ORDER BY created_at DESC LIMIT 12`
    ).all(),
    db.prepare(
      `SELECT * FROM anime ORDER BY rating DESC LIMIT 12`
    ).all(),
    db.prepare(
      `SELECT * FROM anime WHERE is_premium = 1 OR is_vip = 1 ORDER BY created_at DESC LIMIT 12`
    ).all(),
    user
      ? db.prepare(
          `SELECT a.*, wh.progress_seconds, wh.total_seconds, wh.episode_id
           FROM watch_history wh
           JOIN anime a ON a.id = wh.anime_id
           WHERE wh.user_id = ? AND wh.completed = 0
           ORDER BY wh.updated_at DESC LIMIT 12`
        ).bind(user.id).all()
      : Promise.resolve({ results: [] }),
  ])

  const hero = (heroR.results || []) as any[]
  // If no hero slides configured, build from featured anime
  let heroSlides = hero
  if (heroSlides.length === 0) {
    const fallback = await db.prepare(
      `SELECT title, slug as anime_slug, description as subtitle, COALESCE(banner, poster) as image FROM anime
       WHERE is_featured = 1 OR is_trending = 1 ORDER BY rating DESC LIMIT 5`
    ).all()
    heroSlides = (fallback.results || []) as any[]
  }

  const continueWatching = (continueR.results || []).map((r: any) => ({
    ...r,
    _progress: { progress_seconds: r.progress_seconds, total_seconds: r.total_seconds },
  }))

  return c.render(
    <>
      {/* HERO SLIDER */}
      <section class="hero-slider">
        {heroSlides.length === 0 ? (
          <div class="absolute inset-0 grid place-items-center">
            <div class="text-center px-6">
              <h1 class="font-display text-5xl sm:text-7xl mb-4 tracking-wider">
                Welcome to <span class="text-av-orange">AniVerse</span>
              </h1>
              <p class="text-av-muted max-w-xl mx-auto mb-8">
                Stream thousands of premium anime in cinematic 4K quality.
              </p>
              <a href="/browse" class="btn-primary"><i class="fa-solid fa-play"></i>Start Watching</a>
            </div>
          </div>
        ) : (
          <>
            {heroSlides.map((s: any, i: number) => (
              <div class={`hero-slide ${i === 0 ? 'active' : ''}`} style={`background-image:url('${s.image}')`}>
                <div class="hero-content max-w-3xl">
                  <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-av-orange/15 text-av-orange text-xs font-bold uppercase tracking-wider mb-4">
                    <i class="fa-solid fa-fire"></i>Featured
                  </div>
                  <h1 class="font-display text-4xl sm:text-6xl lg:text-7xl tracking-wider leading-none mb-4">
                    {s.title}
                  </h1>
                  <p class="text-av-muted text-base sm:text-lg max-w-xl line-clamp-3 mb-7">
                    {s.subtitle || ''}
                  </p>
                  <div class="flex flex-wrap items-center gap-3">
                    <a href={s.anime_slug ? `/anime/${s.anime_slug}` : (s.cta_link || '/browse')} class="btn-primary">
                      <i class="fa-solid fa-play"></i>{s.cta_text || 'Watch Now'}
                    </a>
                    <a href="/membership" class="btn-ghost"><i class="fa-solid fa-crown"></i>Go Premium</a>
                  </div>
                </div>
              </div>
            ))}
            {heroSlides.length > 1 && (
              <>
                <button class="hero-nav prev" aria-label="Previous"><i class="fa-solid fa-chevron-left"></i></button>
                <button class="hero-nav next" aria-label="Next"><i class="fa-solid fa-chevron-right"></i></button>
                <div class="hero-dots"></div>
              </>
            )}
          </>
        )}
      </section>

      {/* CONTINUE WATCHING */}
      {continueWatching.length > 0 && (
        <CarouselSection title="Continue Watching" items={continueWatching} user={user} showProgress />
      )}

      {/* TRENDING */}
      <CarouselSection title="🔥 Trending Now" items={trendingR.results as any[]} user={user} link="/trending" />

      {/* NEW EPISODES */}
      <CarouselSection title="✨ New & Latest" items={newestR.results as any[]} user={user} link="/browse?sort=newest" />

      {/* PREMIUM MEMBERSHIP BANNER */}
      {(!user || !user.isPremium) && (
        <section class="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 my-12">
          <a href="/membership" class="block">
            <div class="relative overflow-hidden rounded-3xl border border-av-orange/30 bg-gradient-to-br from-av-card to-av-bg-2 p-8 sm:p-12">
              <div class="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-av-orange/20 blur-3xl"></div>
              <div class="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-av-vip/15 blur-3xl"></div>
              <div class="relative grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-av-orange/20 text-av-orange text-xs font-bold uppercase tracking-wider mb-4">
                    <i class="fa-solid fa-crown"></i>Limited Offer
                  </div>
                  <h2 class="font-display text-4xl sm:text-5xl tracking-wider mb-3">
                    Unlock the <span class="text-av-orange">Full Universe</span>
                  </h2>
                  <p class="text-av-muted max-w-md mb-6">
                    Premium gets you ad-free 4K streaming, early episodes, unlimited downloads,
                    and exclusive VIP-only series.
                  </p>
                  <div class="flex flex-wrap gap-3">
                    <span class="btn-primary"><i class="fa-solid fa-crown"></i>Start Free Trial</span>
                    <span class="btn-ghost">From $9.99/mo</span>
                  </div>
                </div>
                <div class="hidden md:flex justify-center">
                  <div class="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { i: 'fa-video', t: '4K Ultra HD' },
                      { i: 'fa-ban', t: 'Ad-Free' },
                      { i: 'fa-bolt', t: 'Early Access' },
                      { i: 'fa-download', t: 'Downloads' },
                      { i: 'fa-gem', t: 'VIP Content' },
                      { i: 'fa-infinity', t: 'Unlimited' },
                    ].map((f) => (
                      <div class="glass px-4 py-3 flex items-center gap-3">
                        <i class={`fa-solid ${f.i} text-av-orange`}></i>{f.t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </a>
        </section>
      )}

      {/* POPULAR */}
      <CarouselSection title="⭐ Popular Today" items={popularR.results as any[]} user={user} link="/browse?sort=views" />

      {/* TOP RATED */}
      <CarouselSection title="🏆 Top Rated" items={topRatedR.results as any[]} user={user} link="/browse?sort=rating" />

      {/* PREMIUM SHOWCASE */}
      {premiumR.results.length > 0 && (
        <CarouselSection title="👑 Premium Exclusive" items={premiumR.results as any[]} user={user} />
      )}

      <div class="h-20"></div>
    </>,
    { title: 'Home', user }
  )
})

// =====================================================
//  BROWSE
// =====================================================
app.get('/browse', async (c) => {
  const user = c.get('user') || null
  const sort = c.req.query('sort') || 'newest'
  const genre = c.req.query('genre') || ''
  const orderSql =
    sort === 'rating' ? 'ORDER BY rating DESC' :
    sort === 'views'  ? 'ORDER BY views DESC' :
    sort === 'title'  ? 'ORDER BY title ASC' :
                        'ORDER BY created_at DESC'

  const where: string[] = []
  const params: any[] = []
  if (genre) { where.push('genres LIKE ?'); params.push(`%${genre}%`) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const all = await c.env.DB.prepare(
    `SELECT * FROM anime ${whereSql} ${orderSql} LIMIT 60`
  ).bind(...params).all()

  const genres = ['Action','Adventure','Romance','Comedy','Drama','Fantasy','Sci-Fi','Slice of Life','Supernatural','Thriller']

  return c.render(
    <div class="pt-24 max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10">
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div class="text-av-muted text-sm uppercase tracking-wider">Discover</div>
          <h1 class="font-display text-4xl sm:text-5xl tracking-wider">Browse All Anime</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          {[
            { v: 'newest', t: 'Newest' },
            { v: 'rating', t: 'Top Rated' },
            { v: 'views', t: 'Most Watched' },
            { v: 'title', t: 'A–Z' },
          ].map((s) => (
            <a href={`/browse?sort=${s.v}${genre ? `&genre=${genre}` : ''}`}
               class={`chip ${sort === s.v ? 'active' : ''}`}>{s.t}</a>
          ))}
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mb-8">
        <a href="/browse" class={`chip ${!genre ? 'active' : ''}`}>All Genres</a>
        {genres.map((g) => (
          <a href={`/browse?genre=${encodeURIComponent(g)}&sort=${sort}`}
             class={`chip ${genre === g ? 'active' : ''}`}>{g}</a>
        ))}
      </div>

      {all.results.length === 0 ? (
        <div class="text-center py-20 text-av-muted">
          <i class="fa-solid fa-film text-5xl mb-4 opacity-50"></i>
          <p>No anime found. Try a different filter.</p>
        </div>
      ) : (
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {(all.results as any[]).map((a) => <AnimeCard anime={a} user={user} />)}
        </div>
      )}
      <div class="h-20"></div>
    </div>,
    { title: 'Browse', user }
  )
})

// =====================================================
//  TRENDING
// =====================================================
app.get('/trending', async (c) => {
  const user = c.get('user') || null
  const r = await c.env.DB.prepare(
    'SELECT * FROM anime WHERE is_trending = 1 OR views > 100 ORDER BY views DESC LIMIT 60'
  ).all()
  return c.render(
    <div class="pt-24 max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10">
      <div class="text-av-muted text-sm uppercase tracking-wider">What's hot</div>
      <h1 class="font-display text-5xl tracking-wider mb-8">🔥 Trending Now</h1>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {(r.results as any[]).map((a) => <AnimeCard anime={a} user={user} />)}
      </div>
      <div class="h-20"></div>
    </div>,
    { title: 'Trending', user }
  )
})

// =====================================================
//  ANIME DETAILS
// =====================================================
app.get('/anime/:slug', async (c) => {
  const user = c.get('user') || null
  const slug = c.req.param('slug')
  const anime = await c.env.DB.prepare('SELECT * FROM anime WHERE slug = ?').bind(slug).first<any>()
  if (!anime) return c.notFound()

  const [epsR, commentsR, isFavR] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM episodes WHERE anime_id = ? ORDER BY number ASC').bind(anime.id).all(),
    c.env.DB.prepare(
      `SELECT c.*, u.username, u.avatar, u.role FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.anime_id = ? ORDER BY c.created_at DESC LIMIT 50`
    ).bind(anime.id).all(),
    user
      ? c.env.DB.prepare('SELECT id FROM favorites WHERE user_id = ? AND anime_id = ?')
          .bind(user.id, anime.id).first()
      : Promise.resolve(null),
  ])

  // Related (same primary genre)
  const firstGenre = (anime.genres || '').split(',')[0].trim()
  const related = firstGenre
    ? await c.env.DB.prepare(
        'SELECT * FROM anime WHERE id != ? AND genres LIKE ? ORDER BY rating DESC LIMIT 12'
      ).bind(anime.id, `%${firstGenre}%`).all()
    : { results: [] }

  const isFavorited = !!isFavR
  const isPremiumContent = !!anime.is_premium || !!anime.is_vip
  const canAccess = !isPremiumContent || (user && (user.isPremium || user.isVip || user.isAdmin))

  return c.render(
    <>
      {/* Banner */}
      <div class="relative h-[60vh] min-h-[420px] max-h-[640px]">
        <div class="absolute inset-0 bg-cover bg-center"
             style={`background-image:url('${anime.banner || anime.poster}')`}></div>
        <div class="absolute inset-0 bg-gradient-to-t from-av-bg via-av-bg/60 to-av-bg/30"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-av-bg via-av-bg/40 to-transparent"></div>
      </div>

      <div class="relative max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 -mt-60 z-10">
        <div class="grid md:grid-cols-[260px_1fr] gap-8">
          <div class="hidden md:block">
            <div class="rounded-2xl overflow-hidden shadow-2xl tilt-card" style="aspect-ratio:2/3">
              <img src={anime.poster} alt={anime.title} class="w-full h-full object-cover" />
            </div>
          </div>
          <div class="flex flex-col justify-end">
            <div class="flex flex-wrap items-center gap-2 mb-3">
              {anime.is_vip ? <span class="px-2 py-1 rounded-md text-xs font-bold bg-av-vip/20 text-av-vip border border-av-vip/40"><i class="fa-solid fa-gem mr-1"></i>VIP</span>
               : anime.is_premium ? <span class="px-2 py-1 rounded-md text-xs font-bold bg-av-orange/20 text-av-orange border border-av-orange/40"><i class="fa-solid fa-crown mr-1"></i>Premium</span>
               : <span class="px-2 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">Free</span>}
              <span class="text-xs text-av-muted uppercase">{anime.type}</span>
              <span class="text-xs text-av-muted">• {anime.release_year}</span>
              <span class="text-xs text-av-muted">• {anime.status}</span>
              {anime.rating > 0 && (
                <span class="text-xs flex items-center gap-1"><i class="fa-solid fa-star text-av-gold"></i>{anime.rating}/10</span>
              )}
            </div>
            <h1 class="font-display text-4xl sm:text-6xl tracking-wider leading-none mb-4">{anime.title}</h1>
            <div class="flex flex-wrap gap-2 mb-4">
              {(anime.genres || '').split(',').filter(Boolean).map((g: string) => (
                <a href={`/browse?genre=${encodeURIComponent(g.trim())}`} class="chip">{g.trim()}</a>
              ))}
            </div>
            <p class="text-av-muted max-w-3xl line-clamp-3 mb-6">{anime.description}</p>
            <div class="flex flex-wrap gap-3">
              {epsR.results.length > 0 && canAccess && (
                <a href={`/watch/${anime.slug}/${(epsR.results[0] as any).number}`} class="btn-primary">
                  <i class="fa-solid fa-play"></i>Watch Now
                </a>
              )}
              {!canAccess && (
                <a href="/membership" class="btn-primary"><i class="fa-solid fa-crown"></i>Unlock with Premium</a>
              )}
              {user && (
                <button data-fav-toggle data-anime-id={anime.id}
                  class={`btn-ghost ${isFavorited ? 'active' : ''}`}>
                  <i class={`${isFavorited ? 'fa-solid text-red-500' : 'fa-regular'} fa-heart`}></i>
                  {isFavorited ? 'In Favorites' : 'Add to Favorites'}
                </button>
              )}
              {anime.trailer && (
                <a href={anime.trailer} target="_blank" class="btn-ghost"><i class="fa-solid fa-film"></i>Trailer</a>
              )}
            </div>
          </div>
        </div>

        {/* Episodes */}
        <section class="mt-12">
          <div class="section-title"><h2>Episodes ({epsR.results.length})</h2></div>
          {epsR.results.length === 0 ? (
            <div class="glass p-8 text-center text-av-muted">No episodes yet — check back soon.</div>
          ) : (
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(epsR.results as any[]).map((ep) => {
                const epLocked = !canAccess && !ep.is_free
                const epPremium = !!ep.is_premium && !ep.is_free
                return (
                  <a href={epLocked ? '#' : `/watch/${anime.slug}/${ep.number}`}
                     data-locked={epLocked ? '' : undefined}
                     class={`ep-item ${epLocked ? 'locked' : ''}`}>
                    <div class="ep-thumb" style={`background-image:url('${ep.thumbnail || anime.banner || anime.poster}')`}>
                      {epLocked && (
                        <div class="lock-mini"><i class="fa-solid fa-lock text-av-orange"></i></div>
                      )}
                      {!epLocked && (
                        <div class="lock-mini opacity-0 hover:opacity-100 transition">
                          <i class="fa-solid fa-play text-white text-xl"></i>
                        </div>
                      )}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-av-muted uppercase tracking-wider">Episode {ep.number}</div>
                      <div class="font-semibold truncate">{ep.title || `Episode ${ep.number}`}</div>
                      <div class="flex items-center gap-2 mt-1 text-xs">
                        {ep.is_free ? (
                          <span class="text-emerald-400"><i class="fa-solid fa-circle-check"></i> Free Preview</span>
                        ) : epPremium ? (
                          <span class="text-av-orange"><i class="fa-solid fa-crown"></i> Premium</span>
                        ) : null}
                        {ep.duration > 0 && (
                          <span class="text-av-muted">{Math.floor(ep.duration / 60)}m</span>
                        )}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </section>

        {/* Comments */}
        <section class="mt-14">
          <div class="section-title"><h2>Comments ({commentsR.results.length})</h2></div>
          {user ? (
            <form data-comment-form action="/api/user/comments" class="glass p-4 mb-6">
              <input type="hidden" name="anime_id" value={anime.id} />
              <textarea name="content" required maxLength={1000} rows={3}
                placeholder="Share your thoughts about this anime…"
                class="w-full bg-transparent border-0 resize-none focus:outline-none text-sm placeholder:text-av-muted"></textarea>
              <div class="flex justify-end">
                <button type="submit" class="btn-primary text-sm py-2"><i class="fa-solid fa-paper-plane"></i>Post</button>
              </div>
            </form>
          ) : (
            <a href="/login" class="block glass p-4 text-center text-av-muted hover:text-av-orange transition mb-6">
              <i class="fa-solid fa-lock mr-2"></i>Login to leave a comment
            </a>
          )}
          <div class="space-y-3">
            {(commentsR.results as any[]).map((cm) => {
              const initials = (cm.username || '').slice(0, 2).toUpperCase()
              return (
                <div class="glass p-4 flex gap-3">
                  <div class={`w-10 h-10 rounded-full grid place-items-center text-xs font-bold flex-shrink-0
                    ${cm.role === 'VIP' ? 'bg-av-vip/20 text-av-vip border border-av-vip/40' :
                      cm.role === 'PREMIUM' ? 'bg-av-orange/20 text-av-orange border border-av-orange/40' :
                      cm.role === 'ADMIN' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                      'bg-av-card border border-av-line'}`}>
                    {cm.avatar ? <img src={cm.avatar} class="w-full h-full rounded-full object-cover" /> : initials}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-sm">{cm.username}</span>
                      {cm.role === 'VIP' && <span class="text-[10px] uppercase font-bold text-av-vip">VIP</span>}
                      {cm.role === 'PREMIUM' && <span class="text-[10px] uppercase font-bold text-av-orange">Premium</span>}
                      {cm.role === 'ADMIN' && <span class="text-[10px] uppercase font-bold text-red-400">Admin</span>}
                      <span class="text-xs text-av-muted">{new Date(cm.created_at).toLocaleDateString()}</span>
                    </div>
                    <p class="text-sm text-av-text/90 mt-1 whitespace-pre-wrap">{cm.content}</p>
                  </div>
                </div>
              )
            })}
            {commentsR.results.length === 0 && (
              <div class="text-center text-av-muted py-8">No comments yet. Be the first!</div>
            )}
          </div>
        </section>

        {related.results.length > 0 && (
          <CarouselSection title="More Like This" items={related.results as any[]} user={user} />
        )}
        <div class="h-20"></div>
      </div>
    </>,
    { title: anime.title, user, description: anime.description }
  )
})

// =====================================================
//  WATCH PAGE
// =====================================================
app.get('/watch/:slug/:number', async (c) => {
  const user = c.get('user') || null
  const slug = c.req.param('slug')
  const number = Number(c.req.param('number'))
  const anime = await c.env.DB.prepare('SELECT * FROM anime WHERE slug = ?').bind(slug).first<any>()
  if (!anime) return c.notFound()
  const episode = await c.env.DB.prepare(
    'SELECT * FROM episodes WHERE anime_id = ? AND number = ?'
  ).bind(anime.id, number).first<any>()
  if (!episode) return c.notFound()

  const allEps = await c.env.DB.prepare(
    'SELECT id, number, title, thumbnail, is_free, is_premium FROM episodes WHERE anime_id = ? ORDER BY number ASC'
  ).bind(anime.id).all()

  const isPremiumContent = !!anime.is_premium || !!anime.is_vip
  const canAccess = !isPremiumContent || (user && (user.isPremium || user.isVip || user.isAdmin))
  const epAccess = canAccess || !!episode.is_free

  // Past progress
  let progress = 0
  if (user) {
    const p = await c.env.DB.prepare(
      'SELECT progress_seconds FROM watch_history WHERE user_id = ? AND episode_id = ?'
    ).bind(user.id, episode.id).first<any>()
    progress = p?.progress_seconds || 0
  }

  if (!epAccess) {
    return c.render(
      <div class="pt-24 max-w-2xl mx-auto px-6 text-center">
        <div class="glass p-10">
          <div class="text-av-orange text-5xl mb-4"><i class="fa-solid fa-lock"></i></div>
          <h1 class="font-display text-4xl tracking-wider mb-3">Premium Required</h1>
          <p class="text-av-muted mb-6">This episode is exclusive to Premium members. Upgrade to unlock the full series in cinematic 4K quality.</p>
          <a href="/membership" class="btn-primary"><i class="fa-solid fa-crown"></i>Upgrade Now</a>
          <a href={`/anime/${anime.slug}`} class="btn-ghost ml-2">Back</a>
        </div>
      </div>,
      { title: `${anime.title} • Ep ${number}`, user }
    )
  }

  const next = (allEps.results as any[]).find((e) => e.number === number + 1)
  const prev = (allEps.results as any[]).find((e) => e.number === number - 1)

  const nextLink = next ? `/watch/${anime.slug}/${next.number}` : null
  const introEnd = 85 // seconds to "skip intro" (default heuristic)

  return c.render(
    <div class="pt-20">
      <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet" />
      <div class="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10">
        <div class="av-page-grid grid lg:grid-cols-[1fr_360px] gap-6">
          {/* Player */}
          <div class="min-w-0">
            <div class="av-player-wrap" id="player-wrap">
              <video id="av-video" class="video-js vjs-default-skin vjs-big-play-centered"
                controls preload="auto" data-resume={progress}
                data-anime-id={anime.id} data-episode-id={episode.id}
                poster={episode.thumbnail || anime.banner || anime.poster}>
                <source src={episode.video_url} type={episode.video_url.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
              </video>
              <div class="av-player-controls">
                <button class="av-player-btn" id="btn-theater" title="Theater mode (T)"><i class="fa-solid fa-expand-wide"></i><span class="hidden sm:inline">Theater</span></button>
                <button class="av-player-btn" id="btn-pip" title="Picture in Picture"><i class="fa-solid fa-window-restore"></i><span class="hidden sm:inline">PiP</span></button>
                <button class="av-player-btn" id="btn-fullscreen" title="Fullscreen (F)"><i class="fa-solid fa-expand"></i><span class="hidden sm:inline">Full</span></button>
              </div>
              <button class="av-skip-intro" id="btn-skip-intro">
                <i class="fa-solid fa-forward"></i> Skip Intro
              </button>
              {next && (
                <div class="av-next-ep" id="next-ep-card">
                  <div class="label">Up Next</div>
                  <div class="title">EP {next.number} • {next.title || `Episode ${next.number}`}</div>
                  <div class="meta">{anime.title}</div>
                  <div class="actions">
                    <a href={nextLink!} class="btn-primary !py-2 !px-3 !text-xs flex-1 text-center"><i class="fa-solid fa-play"></i>Play Next</a>
                    <button class="btn-ghost !py-2 !px-3 !text-xs" id="next-ep-dismiss">Dismiss</button>
                  </div>
                </div>
              )}
            </div>

            <div class="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-xs text-av-muted uppercase tracking-wider">Episode {episode.number}</div>
                <h1 class="font-display text-3xl sm:text-4xl tracking-wider">{episode.title || `Episode ${episode.number}`}</h1>
                <div class="text-av-muted text-sm mt-1">From <a href={`/anime/${anime.slug}`} class="text-av-orange hover:underline">{anime.title}</a></div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn-ghost" id="btn-fav"><i class="fa-regular fa-heart"></i>Favorite</button>
                <a href="/chat/reactions" class="btn-ghost"><i class="fa-solid fa-comments"></i>Discuss</a>
              </div>
            </div>
            <div class="mt-4 flex gap-3 flex-wrap">
              {prev && <a href={`/watch/${anime.slug}/${prev.number}`} class="btn-ghost"><i class="fa-solid fa-backward-step"></i>Prev</a>}
              {next && <a href={`/watch/${anime.slug}/${next.number}`} class="btn-primary">Next<i class="fa-solid fa-forward-step"></i></a>}
              <a href={`/anime/${anime.slug}`} class="btn-ghost"><i class="fa-solid fa-list"></i>All Episodes</a>
              <kbd class="ml-auto text-[10px] text-av-muted px-2 py-1 rounded bg-av-bg border border-av-line">
                <b>F</b> Fullscreen · <b>T</b> Theater · <b>P</b> PiP · <b>←/→</b> Skip 10s · <b>Space</b> Pause
              </kbd>
            </div>
            {episode.description && (
              <div class="glass p-4 mt-4 text-sm text-av-muted">{episode.description}</div>
            )}
          </div>

          {/* Episode list sidebar */}
          <aside class="av-episode-sidebar">
            <div class="section-title"><h2>Episodes</h2></div>
            <div class="glass p-3 max-h-[600px] overflow-y-auto space-y-2">
              {(allEps.results as any[]).map((ep) => {
                const active = ep.number === number
                const epLocked = !canAccess && !ep.is_free
                return (
                  <a href={epLocked ? '#' : `/watch/${anime.slug}/${ep.number}`}
                     data-locked={epLocked ? '' : undefined}
                     class={`flex items-center gap-3 p-2 rounded-xl transition ${active ? 'bg-av-orange/15 border border-av-orange/40' : 'hover:bg-white/5'}`}>
                    <div class="w-20 h-12 rounded-lg bg-cover bg-center flex-shrink-0 relative"
                         style={`background-image:url('${ep.thumbnail || anime.banner || anime.poster}')`}>
                      {active && (
                        <div class="absolute inset-0 bg-av-orange/40 grid place-items-center rounded-lg">
                          <i class="fa-solid fa-play text-white text-xs"></i>
                        </div>
                      )}
                      {epLocked && (
                        <div class="absolute inset-0 bg-black/60 grid place-items-center rounded-lg">
                          <i class="fa-solid fa-lock text-av-orange text-xs"></i>
                        </div>
                      )}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-av-muted">EP {ep.number}</div>
                      <div class="text-sm font-medium truncate">{ep.title || `Episode ${ep.number}`}</div>
                    </div>
                  </a>
                )
              })}
            </div>
          </aside>
        </div>
      </div>

      {/* hls.js + video.js scripts */}
      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
      <script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script>
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          var v = document.getElementById('av-video');
          if (!v) return;
          var src = v.querySelector('source').src;
          var resume = parseFloat(v.dataset.resume || '0');
          var animeId = v.dataset.animeId, epId = v.dataset.episodeId;
          var wrap = document.getElementById('player-wrap');
          var introEnd = ${introEnd};
          var nextLink = ${JSON.stringify(nextLink)};

          // HLS for non-Safari
          if (src && src.indexOf('.m3u8') > -1 && window.Hls && Hls.isSupported() && !v.canPlayType('application/vnd.apple.mpegurl')) {
            var hls = new Hls({ maxBufferLength: 30 });
            hls.loadSource(src);
            hls.attachMedia(v);
          }

          var player = videojs(v, {
            playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
            html5: { vhs: { overrideNative: false } },
            controlBar: { pictureInPictureToggle: false }
          });

          player.ready(function(){
            if (resume > 5) player.currentTime(resume);
          });
          player.on('play', function(){ wrap.classList.remove('paused'); });
          player.on('pause', function(){ wrap.classList.add('paused'); });

          // Save progress every 6s
          var saving = false;
          setInterval(function(){
            if (saving || player.paused()) return;
            var p = Math.floor(player.currentTime()||0);
            var t = Math.floor(player.duration()||0);
            if (!p || !t) return;
            saving = true;
            fetch('/api/user/watch/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ anime_id: animeId, episode_id: epId, progress: p, total: t })
            }).finally(function(){ saving = false; });
          }, 6000);

          // Skip intro + Next episode overlay
          var skipBtn = document.getElementById('btn-skip-intro');
          var nextCard = document.getElementById('next-ep-card');
          var nextDismiss = document.getElementById('next-ep-dismiss');
          var nextDismissed = false;
          if (nextDismiss) nextDismiss.addEventListener('click', function(e){ e.stopPropagation(); nextDismissed = true; if(nextCard) nextCard.classList.remove('show'); });

          player.on('timeupdate', function(){
            var t = player.currentTime() || 0;
            var dur = player.duration() || 0;
            // Show skip intro between 5s-introEnd
            if (skipBtn) {
              if (t > 5 && t < introEnd) skipBtn.classList.add('show');
              else skipBtn.classList.remove('show');
            }
            // Show next ep card in last 30s
            if (nextCard && !nextDismissed && nextLink && dur > 30 && t > dur - 30) {
              nextCard.classList.add('show');
            } else if (nextCard) {
              nextCard.classList.remove('show');
            }
          });
          if (skipBtn) skipBtn.addEventListener('click', function(){
            player.currentTime(introEnd);
            skipBtn.classList.remove('show');
          });

          // Auto-next on end
          player.on('ended', function(){ if (nextLink) location.href = nextLink; });

          // Theater mode
          var theaterBtn = document.getElementById('btn-theater');
          if (theaterBtn) theaterBtn.addEventListener('click', function(){
            document.body.classList.toggle('is-theater');
            theaterBtn.querySelector('i').className = document.body.classList.contains('is-theater') ? 'fa-solid fa-compress-wide' : 'fa-solid fa-expand-wide';
          });
          // Fullscreen
          var fsBtn = document.getElementById('btn-fullscreen');
          if (fsBtn) fsBtn.addEventListener('click', function(){
            if (player.isFullscreen()) player.exitFullscreen(); else player.requestFullscreen();
          });
          // Picture-in-picture
          var pipBtn = document.getElementById('btn-pip');
          if (pipBtn) pipBtn.addEventListener('click', async function(){
            try {
              if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
              } else if (v.requestPictureInPicture) {
                await v.requestPictureInPicture();
              }
            } catch(e){ window.toast && window.toast('PiP unavailable', 'error'); }
          });

          // Keyboard shortcuts (when not focused on input)
          document.addEventListener('keydown', function(e){
            if (['INPUT','TEXTAREA'].indexOf(e.target.tagName) !== -1) return;
            switch(e.key.toLowerCase()){
              case 'f': e.preventDefault(); fsBtn && fsBtn.click(); break;
              case 't': e.preventDefault(); theaterBtn && theaterBtn.click(); break;
              case 'p': e.preventDefault(); pipBtn && pipBtn.click(); break;
              case ' ': e.preventDefault(); player.paused() ? player.play() : player.pause(); break;
              case 'arrowright': e.preventDefault(); player.currentTime(player.currentTime() + 10); break;
              case 'arrowleft': e.preventDefault(); player.currentTime(player.currentTime() - 10); break;
              case 'arrowup': e.preventDefault(); player.volume(Math.min(1, player.volume() + 0.05)); break;
              case 'arrowdown': e.preventDefault(); player.volume(Math.max(0, player.volume() - 0.05)); break;
              case 'm': e.preventDefault(); player.muted(!player.muted()); break;
            }
          });

          // Favorite toggle
          var favBtn = document.getElementById('btn-fav');
          if (favBtn) favBtn.addEventListener('click', async function(){
            try {
              const r = await window.api('/api/user/favorites/toggle', { method:'POST', body:{ anime_id: animeId } });
              favBtn.querySelector('i').className = r.favorited ? 'fa-solid fa-heart text-av-orange' : 'fa-regular fa-heart';
              window.toast(r.favorited ? 'Added to favorites' : 'Removed from favorites', 'success');
            } catch(err){ window.toast(err.message || 'Login required','error'); }
          });
        })();
      ` }} />
      <div class="h-20"></div>
    </div>,
    { title: `${anime.title} • Ep ${number}`, user }
  )
})

// =====================================================
//  SEARCH
// =====================================================
app.get('/search', async (c) => {
  const user = c.get('user') || null
  const q = c.req.query('q') || ''
  let results: any[] = []
  if (q) {
    const r = await c.env.DB.prepare(
      `SELECT * FROM anime WHERE title LIKE ? OR description LIKE ? OR genres LIKE ?
       ORDER BY views DESC LIMIT 60`
    ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all()
    results = (r.results || []) as any[]
  }
  return c.render(
    <div class="pt-24 max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10">
      <h1 class="font-display text-5xl tracking-wider mb-6">Search</h1>
      <form action="/search" method="GET" class="relative mb-8 max-w-2xl">
        <i class="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-av-muted"></i>
        <input name="q" type="text" value={q} placeholder="Search by title, genre, studio…"
          class="w-full bg-av-card border border-av-line rounded-full pl-14 pr-5 py-4 text-base focus:outline-none focus:border-av-orange focus:ring-2 focus:ring-av-orange/20" />
      </form>
      {q && (
        <div class="text-av-muted text-sm mb-6">
          {results.length} result{results.length === 1 ? '' : 's'} for "<span class="text-av-orange">{q}</span>"
        </div>
      )}
      {results.length > 0 ? (
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map((a) => <AnimeCard anime={a} user={user} />)}
        </div>
      ) : q ? (
        <div class="text-center py-20 text-av-muted">
          <i class="fa-solid fa-magnifying-glass text-5xl mb-4 opacity-50"></i>
          <p>No results for "{q}". Try a different keyword.</p>
        </div>
      ) : null}
      <div class="h-20"></div>
    </div>,
    { title: q ? `Search: ${q}` : 'Search', user }
  )
})

// =====================================================
//  AUTH PAGES
// =====================================================
app.get('/login', async (c) => {
  const user = c.get('user')
  if (user) return c.redirect('/')
  return c.render(
    <div class="auth-bg min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      <div class="w-full max-w-md relative z-10">
        <a href="/" class="flex items-center gap-2 justify-center mb-8">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-av-orange to-av-orange-2 grid place-items-center">
            <i class="fa-solid fa-play text-white text-sm ml-0.5"></i>
          </div>
          <span class="font-display tracking-wider text-3xl">ANI<span class="text-av-orange">VERSE</span></span>
        </a>
        <div class="glass p-8">
          <h1 class="font-display text-3xl tracking-wider text-center mb-2">Welcome Back</h1>
          <p class="text-av-muted text-center text-sm mb-8">Sign in to continue your journey</p>
          <form data-auth-form action="/api/auth/login" data-redirect="/" class="space-y-4">
            <div class="relative">
              <i class="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-av-muted"></i>
              <input type="email" name="email" required placeholder="Email" class="input-field" />
            </div>
            <div class="relative">
              <i class="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-av-muted"></i>
              <input type="password" name="password" required minLength={6} placeholder="Password" class="input-field" />
            </div>
            <button type="submit" class="w-full btn-primary justify-center">
              <i class="fa-solid fa-right-to-bracket"></i>Sign In
            </button>
          </form>
          <div class="my-6 flex items-center gap-3">
            <div class="flex-1 h-px bg-av-line"></div>
            <span class="text-xs text-av-muted">OR</span>
            <div class="flex-1 h-px bg-av-line"></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button onclick="window.toast('Google OAuth requires API credentials','info')" class="btn-ghost justify-center text-sm">
              <i class="fa-brands fa-google"></i>Google
            </button>
            <button onclick="window.toast('Discord OAuth requires API credentials','info')" class="btn-ghost justify-center text-sm">
              <i class="fa-brands fa-discord"></i>Discord
            </button>
          </div>
          <div class="text-center mt-6 text-sm text-av-muted">
            New here? <a href="/register" class="text-av-orange hover:underline">Create an account</a>
          </div>
        </div>
        <div class="text-center text-xs text-av-muted mt-6">
          Demo: admin@aniverse.app / admin123
        </div>
      </div>
    </div>,
    { title: 'Sign In', hideNav: true }
  )
})

app.get('/register', async (c) => {
  const user = c.get('user')
  if (user) return c.redirect('/')
  return c.render(
    <div class="auth-bg min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      <div class="w-full max-w-md relative z-10">
        <a href="/" class="flex items-center gap-2 justify-center mb-8">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-av-orange to-av-orange-2 grid place-items-center">
            <i class="fa-solid fa-play text-white text-sm ml-0.5"></i>
          </div>
          <span class="font-display tracking-wider text-3xl">ANI<span class="text-av-orange">VERSE</span></span>
        </a>
        <div class="glass p-8">
          <h1 class="font-display text-3xl tracking-wider text-center mb-2">Join AniVerse</h1>
          <p class="text-av-muted text-center text-sm mb-8">Start streaming in seconds — it's free</p>
          <form data-auth-form action="/api/auth/register" data-redirect="/" class="space-y-4">
            <div class="relative">
              <i class="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-av-muted"></i>
              <input type="text" name="username" required minLength={3} placeholder="Username" class="input-field" />
            </div>
            <div class="relative">
              <i class="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-av-muted"></i>
              <input type="email" name="email" required placeholder="Email" class="input-field" />
            </div>
            <div class="relative">
              <i class="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-av-muted"></i>
              <input type="password" name="password" required minLength={6} placeholder="Password (6+ characters)" class="input-field" />
            </div>
            <button type="submit" class="w-full btn-primary justify-center">
              <i class="fa-solid fa-rocket"></i>Create Account
            </button>
          </form>
          <div class="text-center mt-6 text-sm text-av-muted">
            Already a member? <a href="/login" class="text-av-orange hover:underline">Sign in</a>
          </div>
        </div>
      </div>
    </div>,
    { title: 'Sign Up', hideNav: true }
  )
})

// =====================================================
//  PROFILE
// =====================================================
app.get('/profile', requireAuth, async (c) => {
  const user = c.get('user')!
  const [favoritesR, historyR, paymentsR] = await Promise.all([
    c.env.DB.prepare(
      `SELECT a.* FROM favorites f JOIN anime a ON a.id = f.anime_id
       WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 24`
    ).bind(user.id).all(),
    c.env.DB.prepare(
      `SELECT a.*, wh.progress_seconds, wh.total_seconds, wh.updated_at, wh.episode_id, e.number as ep_number
       FROM watch_history wh JOIN anime a ON a.id = wh.anime_id
       LEFT JOIN episodes e ON e.id = wh.episode_id
       WHERE wh.user_id = ? ORDER BY wh.updated_at DESC LIMIT 24`
    ).bind(user.id).all(),
    c.env.DB.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(user.id).all(),
  ])

  const initials = user.username.slice(0, 2).toUpperCase()
  return c.render(
    <div class="pt-24 max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10">
      {/* Header */}
      <div class="glass p-6 sm:p-8 mb-8 flex flex-col sm:flex-row items-center gap-6">
        <div class={`w-24 h-24 rounded-full grid place-items-center text-3xl font-bold border-4
          ${user.isVip ? 'border-av-vip shadow-[0_0_30px_-5px_rgba(184,138,255,0.7)]' :
            user.isPremium ? 'border-av-orange shadow-av-glow' :
            'border-av-line'} bg-av-card`}>
          {user.avatar ? <img src={user.avatar} class="w-full h-full rounded-full object-cover" /> : initials}
        </div>
        <div class="flex-1 text-center sm:text-left">
          <h1 class="font-display text-3xl sm:text-4xl tracking-wider">{user.username}</h1>
          <div class="text-av-muted text-sm">{user.email}</div>
          <div class="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
            {user.isAdmin && <span class="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400">Administrator</span>}
            {user.isVip && !user.isAdmin && <span class="px-3 py-1 rounded-full text-xs font-bold bg-av-vip/20 text-av-vip"><i class="fa-solid fa-gem mr-1"></i>VIP Member</span>}
            {user.isPremium && !user.isVip && !user.isAdmin && <span class="px-3 py-1 rounded-full text-xs font-bold bg-av-orange/20 text-av-orange"><i class="fa-solid fa-crown mr-1"></i>Premium</span>}
            {!user.isPremium && <span class="px-3 py-1 rounded-full text-xs font-bold bg-av-card text-av-muted">Free Member</span>}
          </div>
        </div>
        {!user.isPremium && (
          <a href="/membership" class="btn-primary"><i class="fa-solid fa-crown"></i>Upgrade</a>
        )}
        <button type="button" data-logout class="btn-ghost"><i class="fa-solid fa-right-from-bracket"></i>Logout</button>
      </div>

      {/* Stats */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {[
          { i: 'fa-clock-rotate-left', l: 'Watched', v: historyR.results.length },
          { i: 'fa-heart', l: 'Favorites', v: favoritesR.results.length },
          { i: 'fa-credit-card', l: 'Payments', v: paymentsR.results.length },
          { i: 'fa-crown', l: 'Plan', v: user.isVip ? 'VIP' : user.isPremium ? 'Premium' : 'Free' },
        ].map((s) => (
          <div class="glass p-4 text-center">
            <i class={`fa-solid ${s.i} text-av-orange text-xl mb-2`}></i>
            <div class="text-2xl font-bold">{s.v}</div>
            <div class="text-xs text-av-muted uppercase tracking-wider">{s.l}</div>
          </div>
        ))}
      </div>

      {historyR.results.length > 0 && (
        <CarouselSection title="Continue Watching"
          items={(historyR.results as any[]).map((r) => ({ ...r, _progress: { progress_seconds: r.progress_seconds, total_seconds: r.total_seconds }}))}
          user={user} showProgress />
      )}

      {favoritesR.results.length > 0 && (
        <CarouselSection title="My Favorites" items={favoritesR.results as any[]} user={user} />
      )}

      <div class="h-20"></div>
    </div>,
    { title: 'Profile', user }
  )
})

// =====================================================
//  MEMBERSHIP
// =====================================================
app.get('/membership', async (c) => {
  const user = c.get('user') || null
  return c.render(
    <div class="pt-24 pb-20 max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10">
      <div class="text-center max-w-3xl mx-auto mb-14">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-av-orange/15 text-av-orange text-xs font-bold uppercase tracking-wider mb-4">
          <i class="fa-solid fa-crown"></i>Membership
        </div>
        <h1 class="font-display text-5xl sm:text-7xl tracking-wider mb-4">
          Pick Your <span class="text-av-orange">Plan</span>
        </h1>
        <p class="text-av-muted text-lg">Unlock premium anime, 4K streaming, and exclusive VIP content.</p>
      </div>

      <div class="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {/* FREE */}
        <div class="price-card">
          <div class="text-xs uppercase tracking-wider text-av-muted">Free</div>
          <div class="font-display text-5xl tracking-wide my-3">$0<span class="text-base text-av-muted font-sans">/mo</span></div>
          <p class="text-sm text-av-muted mb-6">Get started for free with limited access.</p>
          <ul class="space-y-3 text-sm mb-7">
            <li class="flex gap-2"><i class="fa-solid fa-check text-emerald-400 mt-1"></i>Selected free anime</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-emerald-400 mt-1"></i>Up to 720p quality</li>
            <li class="flex gap-2"><i class="fa-solid fa-xmark text-red-400 mt-1"></i>With ads</li>
            <li class="flex gap-2"><i class="fa-solid fa-xmark text-red-400 mt-1"></i>No downloads</li>
            <li class="flex gap-2"><i class="fa-solid fa-xmark text-red-400 mt-1"></i>No early access</li>
          </ul>
          <button disabled class="w-full py-3 rounded-full bg-av-card text-av-muted">Current Plan</button>
        </div>

        {/* PREMIUM */}
        <div class="price-card featured">
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-av-orange text-black text-xs font-bold uppercase tracking-wider">Most Popular</div>
          <div class="text-xs uppercase tracking-wider text-av-orange">Premium</div>
          <div class="font-display text-5xl tracking-wide my-3">$9.99<span class="text-base text-av-muted font-sans">/mo</span></div>
          <p class="text-sm text-av-muted mb-6">Everything you need for endless anime.</p>
          <ul class="space-y-3 text-sm mb-7">
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-orange mt-1"></i>Unlock all anime & episodes</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-orange mt-1"></i>4K Ultra HD streaming</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-orange mt-1"></i>Completely ad-free</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-orange mt-1"></i>Unlimited downloads</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-orange mt-1"></i>Early episode access</li>
          </ul>
          {user
            ? <button onclick="checkout('PREMIUM')" class="w-full btn-primary justify-center"><i class="fa-solid fa-crown"></i>Upgrade to Premium</button>
            : <a href="/register" class="block text-center w-full btn-primary justify-center">Sign up to start</a>}
        </div>

        {/* VIP */}
        <div class="price-card vip">
          <div class="text-xs uppercase tracking-wider text-av-vip">VIP</div>
          <div class="font-display text-5xl tracking-wide my-3">$19.99<span class="text-base text-av-muted font-sans">/mo</span></div>
          <p class="text-sm text-av-muted mb-6">For the true otaku — exclusive perks.</p>
          <ul class="space-y-3 text-sm mb-7">
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-vip mt-1"></i>Everything in Premium</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-vip mt-1"></i>VIP-exclusive anime</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-vip mt-1"></i>VIP profile effects</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-vip mt-1"></i>Earliest release access</li>
            <li class="flex gap-2"><i class="fa-solid fa-check text-av-vip mt-1"></i>Priority support</li>
          </ul>
          {user
            ? <button onclick="checkout('VIP')" class="w-full py-3 rounded-full bg-gradient-to-r from-av-vip to-purple-400 text-black font-bold"><i class="fa-solid fa-gem mr-2"></i>Go VIP</button>
            : <a href="/register" class="block text-center w-full py-3 rounded-full bg-av-vip text-black font-bold">Sign up first</a>}
        </div>
      </div>

      <div class="text-center text-xs text-av-muted mt-10">
        Demo mode: clicking Upgrade instantly grants the plan for testing. Connect Stripe in production.
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function checkout(plan){
          try {
            await window.api('/api/membership/checkout', { method: 'POST', body: { plan } });
            window.toast('Welcome to ' + plan + '! Reloading…', 'success');
            setTimeout(() => location.href = '/', 800);
          } catch(e){
            window.toast(e.message || 'Checkout failed', 'error');
          }
        }
      ` }} />
      <div class="h-20"></div>
    </div>,
    { title: 'Membership', user }
  )
})

// =====================================================
//  ADMIN PANEL
// =====================================================
app.get('/admin', requireAdmin, async (c) => {
  const user = c.get('user')!
  const db = c.env.DB
  const [statsUsers, statsAnime, statsEpisodes, statsRevenue, recentUsers, topAnime] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c, SUM(CASE WHEN role IN (\'PREMIUM\',\'VIP\') THEN 1 ELSE 0 END) as p FROM users').first<any>(),
    db.prepare('SELECT COUNT(*) as c FROM anime').first<any>(),
    db.prepare('SELECT COUNT(*) as c FROM episodes').first<any>(),
    db.prepare('SELECT COALESCE(SUM(amount), 0) as r, COUNT(*) as c FROM payments WHERE status = \'COMPLETED\'').first<any>(),
    db.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 6').all(),
    db.prepare('SELECT id, title, views, rating, is_premium FROM anime ORDER BY views DESC LIMIT 6').all(),
  ])

  return c.render(<AdminLayout active="dashboard" user={user}>
    <h1 class="font-display text-4xl tracking-wider mb-6">Dashboard</h1>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <StatCard i="fa-users" l="Total Users" v={statsUsers?.c || 0} sub={`${statsUsers?.p || 0} premium`} />
      <StatCard i="fa-film" l="Total Anime" v={statsAnime?.c || 0} />
      <StatCard i="fa-list" l="Episodes" v={statsEpisodes?.c || 0} />
      <StatCard i="fa-dollar-sign" l="Revenue" v={`$${(statsRevenue?.r || 0).toFixed(2)}`} sub={`${statsRevenue?.c || 0} payments`} />
    </div>
    <div class="grid md:grid-cols-2 gap-6">
      <div class="glass p-5">
        <h3 class="font-semibold mb-4">Recent Users</h3>
        <div class="space-y-2">
          {(recentUsers.results as any[]).map((u) => (
            <div class="flex items-center justify-between text-sm py-2 border-b border-av-line last:border-0">
              <div>
                <div class="font-medium">{u.username}</div>
                <div class="text-xs text-av-muted">{u.email}</div>
              </div>
              <span class={`text-xs px-2 py-0.5 rounded ${u.role === 'PREMIUM' ? 'bg-av-orange/20 text-av-orange' :
                u.role === 'VIP' ? 'bg-av-vip/20 text-av-vip' :
                u.role === 'ADMIN' ? 'bg-red-500/20 text-red-400' : 'bg-av-card text-av-muted'}`}>{u.role}</span>
            </div>
          ))}
        </div>
      </div>
      <div class="glass p-5">
        <h3 class="font-semibold mb-4">Top Anime by Views</h3>
        <div class="space-y-2">
          {(topAnime.results as any[]).map((a) => (
            <div class="flex items-center justify-between text-sm py-2 border-b border-av-line last:border-0">
              <div class="truncate">{a.title}</div>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-av-muted"><i class="fa-solid fa-eye mr-1"></i>{a.views}</span>
                {a.is_premium ? <span class="text-av-orange"><i class="fa-solid fa-crown"></i></span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </AdminLayout>, { title: 'Admin', user })
})

app.get('/admin/anime', requireAdmin, async (c) => {
  const user = c.get('user')!
  const list = await c.env.DB.prepare(
    'SELECT id, title, slug, poster, views, rating, is_premium, is_vip, is_featured, type, status FROM anime ORDER BY created_at DESC LIMIT 200'
  ).all()
  return c.render(<AdminLayout active="anime" user={user}>
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display text-4xl tracking-wider">Anime Management</h1>
      <a href="/admin/anime/new" class="btn-primary"><i class="fa-solid fa-plus"></i>Add Anime</a>
    </div>
    <div class="glass p-5 overflow-x-auto">
      <table class="w-full text-sm min-w-[800px]">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wider text-av-muted border-b border-av-line">
            <th class="py-2">Poster</th><th>Title</th><th>Type</th><th>Status</th><th>Views</th><th>Rating</th><th>Tier</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(list.results as any[]).map((a) => (
            <tr class="border-b border-av-line">
              <td class="py-2"><div class="w-10 h-14 rounded bg-cover bg-center" style={`background-image:url('${a.poster}')`}></div></td>
              <td class="font-medium">{a.title}<div class="text-xs text-av-muted">{a.slug}</div></td>
              <td>{a.type}</td>
              <td><span class="text-xs px-2 py-0.5 rounded bg-av-card">{a.status}</span></td>
              <td>{a.views}</td>
              <td>{a.rating}</td>
              <td>
                {a.is_vip ? <span class="text-xs text-av-vip">VIP</span>
                  : a.is_premium ? <span class="text-xs text-av-orange">Premium</span>
                  : <span class="text-xs text-emerald-400">Free</span>}
              </td>
              <td class="text-right">
                <a href={`/admin/anime/${a.id}/edit`} class="text-av-orange hover:underline text-xs mr-3">Edit</a>
                <a href={`/admin/anime/${a.id}/episodes`} class="text-blue-400 hover:underline text-xs mr-3">Episodes</a>
                <button onclick={`if(confirm('Delete ${a.title}?')) deleteAnime(${a.id})`} class="text-red-400 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <script dangerouslySetInnerHTML={{ __html: `
      async function deleteAnime(id){
        try { await window.api('/api/admin/anime/'+id, { method:'DELETE' }); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
    ` }} />
  </AdminLayout>, { title: 'Admin • Anime', user })
})

app.get('/admin/anime/new', requireAdmin, async (c) => {
  const user = c.get('user')!
  return c.render(<AdminLayout active="anime" user={user}>
    <AnimeForm action="/api/admin/anime" method="POST" />
  </AdminLayout>, { title: 'Add Anime', user })
})

app.get('/admin/anime/:id/edit', requireAdmin, async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const a = await c.env.DB.prepare('SELECT * FROM anime WHERE id = ?').bind(id).first<any>()
  if (!a) return c.notFound()
  return c.render(<AdminLayout active="anime" user={user}>
    <AnimeForm action={`/api/admin/anime/${id}`} method="PUT" data={a} />
  </AdminLayout>, { title: 'Edit Anime', user })
})

app.get('/admin/anime/:id/episodes', requireAdmin, async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const a = await c.env.DB.prepare('SELECT * FROM anime WHERE id = ?').bind(id).first<any>()
  if (!a) return c.notFound()
  const seasons = await c.env.DB.prepare(
    'SELECT * FROM seasons WHERE anime_id = ? ORDER BY number ASC'
  ).bind(id).all()
  const eps = await c.env.DB.prepare(
    'SELECT * FROM episodes WHERE anime_id = ? ORDER BY season_number ASC, number ASC'
  ).bind(id).all()
  const grouped: Record<number, any[]> = {}
  for (const ep of (eps.results as any[])) {
    const sn = ep.season_number || 1
    if (!grouped[sn]) grouped[sn] = []
    grouped[sn].push(ep)
  }
  const seasonNumbers = Object.keys(grouped).map(Number).sort((a, b) => a - b)
  if (seasonNumbers.length === 0) seasonNumbers.push(1)

  return c.render(<AdminLayout active="anime" user={user}>
    <div class="mb-6">
      <a href="/admin/anime" class="text-sm text-av-muted hover:text-av-orange"><i class="fa-solid fa-arrow-left mr-1"></i>Back</a>
      <h1 class="font-display text-3xl md:text-4xl tracking-wider mt-2">Episodes — {a.title}</h1>
      <p class="text-av-muted text-sm mt-1">{(seasons.results as any[]).length} season(s) · {(eps.results as any[]).length} episode(s)</p>
    </div>

    <div class="grid lg:grid-cols-[1fr_400px] gap-6">
      <div class="space-y-6 min-w-0">
        <div class="glass p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold"><i class="fa-solid fa-layer-group mr-2 text-av-orange"></i>Seasons</h3>
            <button onclick="document.getElementById('seasonModal').classList.remove('hidden')" class="text-sm text-av-orange hover:underline">+ Add Season</button>
          </div>
          <div class="flex flex-wrap gap-2">
            {(seasons.results as any[]).map((s) => (
              <div class="px-3 py-2 rounded-lg bg-av-card border border-av-line text-sm flex items-center gap-2">
                <span class="font-semibold">S{s.number}</span>
                <span class="text-av-muted">{s.title}</span>
                <span class="text-xs text-av-muted">({s.episode_count} eps)</span>
                <button onclick={`deleteSeason(${s.id})`} class="text-red-400 hover:text-red-300 ml-1" title="Delete season"><i class="fa-solid fa-xmark text-xs"></i></button>
              </div>
            ))}
            {(seasons.results as any[]).length === 0 && (
              <p class="text-av-muted text-sm">No seasons yet — they'll auto-create when you add episodes.</p>
            )}
          </div>
        </div>

        {seasonNumbers.map((sn) => (
          <div class="glass p-5">
            <h3 class="font-semibold mb-3 text-av-orange">Season {sn}</h3>
            {(grouped[sn] || []).length === 0 ? (
              <p class="text-av-muted text-sm py-4 text-center">No episodes in this season yet.</p>
            ) : (
              <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr class="text-left text-xs uppercase tracking-wider text-av-muted border-b border-av-line">
                      <th class="py-2">#</th><th>Title</th><th>Access</th><th>Duration</th><th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grouped[sn] || []).map((ep) => (
                      <tr class="border-b border-av-line hover:bg-white/[0.02]">
                        <td class="py-2 font-mono">{ep.number}</td>
                        <td class="truncate max-w-[280px]">{ep.title}</td>
                        <td>
                          <button onclick={`toggleFree(${ep.id})`} class={`px-2 py-0.5 rounded text-xs ${ep.is_free ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {ep.is_free ? 'Free' : 'Premium'}
                          </button>
                        </td>
                        <td class="text-av-muted">{ep.duration ? `${Math.floor(ep.duration/60)}m` : '-'}</td>
                        <td class="text-right whitespace-nowrap">
                          <button onclick={`replaceVideo(${ep.id})`} class="text-blue-400 text-xs hover:underline mr-2">Replace</button>
                          <button onclick={`if(confirm('Delete ep ${ep.number}?')) deleteEp(${ep.id})`} class="text-red-400 text-xs hover:underline">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <div class="space-y-4">
        <div class="glass p-5 lg:sticky lg:top-4">
          <h3 class="font-semibold mb-4"><i class="fa-solid fa-plus mr-2 text-av-orange"></i>Add Episode</h3>
          <form id="epform" class="space-y-3 text-sm">
            <input type="hidden" name="anime_id" value={id} />
            <div class="grid grid-cols-2 gap-2">
              <input name="season_number" type="number" min="1" defaultValue="1" required placeholder="Season #" class="input-field pl-4" />
              <input name="number" type="number" min="1" required placeholder="Episode #" class="input-field pl-4" />
            </div>
            <input name="title" placeholder="Title" class="input-field pl-4" />
            <input name="thumbnail" placeholder="Thumbnail URL (optional)" class="input-field pl-4" />

            <div id="dropzone" class="border-2 border-dashed border-av-line rounded-xl p-4 text-center cursor-pointer hover:border-av-orange transition">
              <i class="fa-solid fa-cloud-arrow-up text-2xl text-av-muted mb-1"></i>
              <p class="text-xs text-av-muted">Drop MP4 here or <span class="text-av-orange underline">browse</span></p>
              <p class="text-[10px] text-av-muted/60 mt-1">Max 4 MB inline · for big files paste URL below</p>
              <input id="fileInput" type="file" accept="video/*" class="hidden" />
              <div id="uploadProgress" class="hidden mt-2">
                <div class="h-1.5 bg-av-line rounded-full overflow-hidden">
                  <div id="uploadBar" class="h-full bg-av-orange transition-all" style="width:0%"></div>
                </div>
                <p id="uploadStatus" class="text-xs text-av-muted mt-1">Uploading...</p>
              </div>
            </div>

            <input id="videoUrl" name="video_url" required placeholder="Video URL (mp4 / m3u8) — or upload above" class="input-field pl-4" />
            <input name="duration" type="number" placeholder="Duration (sec, optional)" class="input-field pl-4" />
            <textarea name="description" rows={2} placeholder="Description (optional)" class="input-field pl-4"></textarea>
            <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="is_free" /> Free preview (everyone can watch)</label>
            <input type="hidden" name="is_premium" value="1" />
            <button type="submit" class="w-full btn-primary justify-center text-sm"><i class="fa-solid fa-plus mr-1"></i>Add Episode</button>
          </form>
        </div>
      </div>
    </div>

    <div id="seasonModal" class="hidden fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onclick="if(event.target===this)this.classList.add('hidden')">
      <div class="glass p-6 max-w-md w-full">
        <h3 class="font-semibold mb-4">New Season</h3>
        <form id="seasonForm" class="space-y-3 text-sm">
          <input type="hidden" name="anime_id" value={id} />
          <input name="number" type="number" min="1" required placeholder="Season number" class="input-field pl-4" />
          <input name="title" placeholder="Season title" class="input-field pl-4" />
          <input name="poster" placeholder="Poster URL (optional)" class="input-field pl-4" />
          <input name="release_year" type="number" placeholder="Release year" class="input-field pl-4" />
          <textarea name="description" rows={2} placeholder="Description" class="input-field pl-4"></textarea>
          <div class="flex gap-2">
            <button type="submit" class="flex-1 btn-primary justify-center text-sm">Create</button>
            <button type="button" onclick="document.getElementById('seasonModal').classList.add('hidden')" class="flex-1 btn-ghost justify-center text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <script dangerouslySetInnerHTML={{ __html: `
      document.getElementById('epform').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = {};
        fd.forEach((v,k) => body[k] = v);
        body.is_free = fd.get('is_free') ? 1 : 0;
        if (!body.video_url) { window.toast('Video URL or file required','error'); return; }
        try { await window.api('/api/admin/episodes', { method:'POST', body }); window.toast('Episode added','success'); location.reload(); }
        catch(err){ window.toast(err.message,'error'); }
      });

      const dz = document.getElementById('dropzone');
      const fi = document.getElementById('fileInput');
      const bar = document.getElementById('uploadBar');
      const prog = document.getElementById('uploadProgress');
      const stat = document.getElementById('uploadStatus');
      const urlField = document.getElementById('videoUrl');
      dz.addEventListener('click', () => fi.click());
      ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('border-av-orange'); }));
      ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('border-av-orange'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); });
      fi.addEventListener('change', (e) => { if (e.target.files[0]) handleUpload(e.target.files[0]); });

      async function handleUpload(file) {
        if (!file.type.startsWith('video/')) { window.toast('Please drop a video file','error'); return; }
        if (file.size > 4 * 1024 * 1024) {
          window.toast('File >4 MB — please paste an external CDN URL instead','error');
          return;
        }
        prog.classList.remove('hidden');
        bar.style.width = '5%';
        stat.textContent = 'Reading ' + file.name + '...';
        try {
          const reader = new FileReader();
          reader.onprogress = (e) => { if (e.lengthComputable) bar.style.width = (5 + (e.loaded / e.total) * 30) + '%'; };
          const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          bar.style.width = '50%'; stat.textContent = 'Uploading...';
          const resp = await window.api('/api/admin/upload/video', {
            method: 'POST',
            body: { filename: file.name, mime: file.type, data_url: dataUrl }
          });
          bar.style.width = '100%';
          stat.textContent = '✓ Uploaded';
          urlField.value = resp.url;
          window.toast('Video ready — submit form to save episode','success');
          setTimeout(() => { prog.classList.add('hidden'); bar.style.width = '0%'; }, 1200);
        } catch(err) {
          stat.textContent = '✗ ' + (err.message || 'Upload failed');
          bar.style.width = '0%';
          window.toast(err.message,'error');
        }
      }

      document.getElementById('seasonForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = {};
        fd.forEach((v,k) => body[k] = v);
        try { await window.api('/api/admin/seasons', { method:'POST', body }); window.toast('Season added','success'); location.reload(); }
        catch(err){ window.toast(err.message,'error'); }
      });

      async function deleteSeason(id){
        if (!confirm('Delete this season? Episodes will be detached but kept.')) return;
        try { await window.api('/api/admin/seasons/'+id,{method:'DELETE'}); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
      async function toggleFree(id){
        try { await window.api('/api/admin/episodes/'+id+'/toggle-free',{method:'POST'}); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
      async function deleteEp(id){
        try { await window.api('/api/admin/episodes/'+id,{method:'DELETE'}); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
      async function replaceVideo(id){
        const url = prompt('New video URL (mp4 / m3u8):');
        if (!url) return;
        try {
          await window.api('/api/admin/episodes/'+id, { method:'PUT', body: { video_url: url } });
          window.toast('Video replaced','success');
          location.reload();
        } catch(e){ window.toast(e.message,'error'); }
      }
    ` }} />
  </AdminLayout>, { title: 'Episodes', user })
})

app.get('/admin/users', requireAdmin, async (c) => {
  const user = c.get('user')!
  const users = await c.env.DB.prepare(
    'SELECT id, email, username, role, premium_until, banned, created_at FROM users ORDER BY created_at DESC LIMIT 200'
  ).all()
  return c.render(<AdminLayout active="users" user={user}>
    <h1 class="font-display text-4xl tracking-wider mb-6">User Management</h1>
    <div class="glass p-5 overflow-x-auto">
      <table class="w-full text-sm min-w-[700px]">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wider text-av-muted border-b border-av-line">
            <th class="py-2">User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(users.results as any[]).map((u) => (
            <tr class="border-b border-av-line">
              <td class="py-2">{u.username}</td>
              <td class="text-av-muted">{u.email}</td>
              <td>
                <select onchange={`setRole(${u.id}, this.value)`} class="bg-av-card border border-av-line rounded px-2 py-1 text-xs">
                  {['USER','PREMIUM','VIP','ADMIN'].map((r) => (
                    <option value={r} selected={u.role === r}>{r}</option>
                  ))}
                </select>
              </td>
              <td>{u.banned ? <span class="text-red-400">Banned</span> : <span class="text-emerald-400">Active</span>}</td>
              <td class="text-xs text-av-muted">{new Date(u.created_at).toLocaleDateString()}</td>
              <td>
                <button onclick={`toggleBan(${u.id}, ${u.banned})`} class={`text-xs ${u.banned ? 'text-emerald-400' : 'text-red-400'} hover:underline`}>
                  {u.banned ? 'Unban' : 'Ban'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <script dangerouslySetInnerHTML={{ __html: `
      async function setRole(id, role){
        try { await window.api('/api/admin/users/'+id+'/role', { method:'POST', body:{role}}); window.toast('Role updated','success'); }
        catch(e){ window.toast(e.message,'error'); }
      }
      async function toggleBan(id, current){
        if (!confirm(current ? 'Unban this user?' : 'Ban this user?')) return;
        try { await window.api('/api/admin/users/'+id+'/ban',{ method:'POST', body:{banned: !current}}); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
    ` }} />
  </AdminLayout>, { title: 'Admin • Users', user })
})

app.get('/admin/hero', requireAdmin, async (c) => {
  const user = c.get('user')!
  const slides = await c.env.DB.prepare('SELECT hs.*, a.title as anime_title, a.slug as anime_slug FROM hero_slides hs LEFT JOIN anime a ON a.id=hs.anime_id ORDER BY sort_order ASC, hs.id ASC').all()
  const anime = await c.env.DB.prepare('SELECT id, title, slug, banner FROM anime ORDER BY title ASC LIMIT 500').all()
  return c.render(<AdminLayout active="hero" user={user}>
    <div class="mb-6 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-display text-3xl md:text-4xl tracking-wider">Hero Slider</h1>
        <p class="text-av-muted text-sm mt-1">Manage homepage rotating banners — click any slide to edit.</p>
      </div>
      <button id="newSlideBtn" class="btn-primary"><i class="fa-solid fa-plus"></i>New Slide</button>
    </div>

    <div class="grid lg:grid-cols-2 gap-4">
      {(slides.results as any[]).length === 0 ? (
        <div class="glass p-8 text-center text-av-muted col-span-2">No slides yet — click "New Slide" to add one.</div>
      ) : (
        (slides.results as any[]).map((s) => (
          <div class="glass overflow-hidden group">
            <div class="aspect-[16/7] bg-cover bg-center relative" style={`background-image:url('${s.image}')`}>
              <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
              <div class="absolute bottom-0 left-0 right-0 p-4">
                <div class="font-display text-2xl tracking-wider">{s.title}</div>
                <div class="text-sm text-av-muted line-clamp-1">{s.subtitle}</div>
              </div>
              {!s.active && <div class="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-500/80 text-xs uppercase">Inactive</div>}
              <div class="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-xs">#{s.sort_order}</div>
            </div>
            <div class="p-3 flex items-center justify-between text-xs">
              <div class="text-av-muted truncate">
                <i class="fa-solid fa-link mr-1"></i>{s.anime_title ? `Anime: ${s.anime_title}` : (s.cta_link || '/')}
              </div>
              <div class="flex gap-3">
                <button onclick={`editSlide(${s.id})`} class="text-av-orange hover:underline">Edit</button>
                <button onclick={`if(confirm('Delete slide?')) deleteSlide(${s.id})`} class="text-red-400 hover:underline">Delete</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>

    {/* Slide modal (add + edit) */}
    <div id="slideModal" class="hidden fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 overflow-y-auto" onclick="if(event.target===this)closeSlideModal()">
      <div class="glass p-6 max-w-2xl w-full my-8">
        <div class="flex items-center justify-between mb-4">
          <h3 id="modalTitle" class="font-display text-2xl tracking-wider">New Slide</h3>
          <button onclick="closeSlideModal()" class="text-av-muted hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <form id="slideForm" class="space-y-3 text-sm">
          <input type="hidden" id="slideId" name="id" />
          <div class="grid grid-cols-2 gap-3">
            <input name="title" required placeholder="Title (large heading)" class="input-field pl-4" />
            <input name="subtitle" placeholder="Subtitle" class="input-field pl-4" />
          </div>

          <label class="block text-xs uppercase text-av-muted mt-2">Background Image</label>
          <div class="flex gap-2">
            <input id="slideImage" name="image" required placeholder="Image URL (Pinterest, TMDB, any)" class="input-field pl-4 flex-1" />
            <button type="button" onclick="importFromUrl()" class="btn-ghost px-3 text-xs whitespace-nowrap" title="Download image so it stays even if source blocks hotlink"><i class="fa-solid fa-cloud-arrow-down mr-1"></i>Import</button>
          </div>
          <div id="slidePreview" class="hidden aspect-[16/7] rounded-lg bg-cover bg-center bg-av-card"></div>

          <div class="grid grid-cols-2 gap-3">
            <select name="anime_id" class="input-field pl-4">
              <option value="">— Link to anime (optional) —</option>
              {(anime.results as any[]).map((a) => <option value={a.id} data-banner={a.banner}>{a.title}</option>)}
            </select>
            <input name="cta_text" placeholder="CTA text" defaultValue="Watch Now" class="input-field pl-4" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <input name="cta_link" placeholder="CTA link (/anime/slug)" class="input-field pl-4" />
            <input name="sort_order" type="number" placeholder="Sort order" defaultValue="0" class="input-field pl-4" />
          </div>
          <label class="flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked /> Active (visible on homepage)</label>

          <div class="flex gap-2 pt-2">
            <button type="submit" class="flex-1 btn-primary justify-center"><i class="fa-solid fa-floppy-disk mr-1"></i><span id="saveLabel">Create Slide</span></button>
            <button type="button" onclick="closeSlideModal()" class="flex-1 btn-ghost justify-center">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <script dangerouslySetInnerHTML={{ __html: `
      const modal = document.getElementById('slideModal');
      const form = document.getElementById('slideForm');
      const titleEl = document.getElementById('modalTitle');
      const saveLabel = document.getElementById('saveLabel');
      const preview = document.getElementById('slidePreview');
      const imageField = document.getElementById('slideImage');

      function openModal() { modal.classList.remove('hidden'); document.body.style.overflow='hidden'; }
      function closeSlideModal() { modal.classList.add('hidden'); document.body.style.overflow=''; form.reset(); document.getElementById('slideId').value=''; preview.classList.add('hidden'); }
      window.closeSlideModal = closeSlideModal;

      document.getElementById('newSlideBtn').addEventListener('click', () => {
        titleEl.textContent = 'New Slide';
        saveLabel.textContent = 'Create Slide';
        form.reset();
        document.getElementById('slideId').value = '';
        preview.classList.add('hidden');
        openModal();
      });

      // Live preview of image URL
      imageField.addEventListener('input', () => {
        const v = imageField.value.trim();
        if (v) { preview.style.backgroundImage = "url('" + v + "')"; preview.classList.remove('hidden'); }
        else { preview.classList.add('hidden'); }
      });

      // Auto-fill image when anime is selected
      form.anime_id.addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        const banner = opt?.dataset?.banner;
        if (banner && !imageField.value) {
          imageField.value = banner;
          imageField.dispatchEvent(new Event('input'));
        }
        // Auto-set cta_link to anime page
        const slug = opt?.text;
        if (opt.value && !form.cta_link.value) {
          // Use anime route /watch/:slug — keep simple
        }
      });

      window.editSlide = async function(id) {
        try {
          const r = await window.api('/api/admin/hero/' + id);
          const s = r.slide;
          titleEl.textContent = 'Edit Slide #' + id;
          saveLabel.textContent = 'Save Changes';
          document.getElementById('slideId').value = s.id;
          form.title.value = s.title || '';
          form.subtitle.value = s.subtitle || '';
          form.image.value = s.image || '';
          form.anime_id.value = s.anime_id || '';
          form.cta_text.value = s.cta_text || 'Watch Now';
          form.cta_link.value = s.cta_link || '';
          form.sort_order.value = s.sort_order || 0;
          form.active.checked = !!s.active;
          if (s.image) { preview.style.backgroundImage = "url('" + s.image + "')"; preview.classList.remove('hidden'); }
          openModal();
        } catch(e) { window.toast(e.message, 'error'); }
      }

      window.importFromUrl = async function() {
        const u = imageField.value.trim();
        if (!u) { window.toast('Paste an image URL first','error'); return; }
        window.toast('Importing image...', 'info');
        try {
          const r = await window.api('/api/admin/upload/image-from-url', { method:'POST', body: { url: u } });
          imageField.value = r.url;
          imageField.dispatchEvent(new Event('input'));
          window.toast('Imported! (' + (r.size / 1024).toFixed(0) + ' KB) - now stored permanently','success');
        } catch(e) { window.toast(e.message || 'Import failed','error'); }
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = {};
        fd.forEach((v,k) => body[k] = v);
        body.active = fd.get('active') ? 1 : 0;
        const id = body.id; delete body.id;
        try {
          if (id) {
            await window.api('/api/admin/hero/' + id, { method:'PUT', body });
            window.toast('Slide updated','success');
          } else {
            await window.api('/api/admin/hero', { method:'POST', body });
            window.toast('Slide created','success');
          }
          location.reload();
        } catch(err){ window.toast(err.message,'error'); }
      });

      window.deleteSlide = async function(id) {
        try { await window.api('/api/admin/hero/'+id,{method:'DELETE'}); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
    ` }} />
  </AdminLayout>, { title: 'Admin • Hero', user })
})

app.get('/admin/comments', requireAdmin, async (c) => {
  const user = c.get('user')!
  const comments = await c.env.DB.prepare(
    `SELECT c.*, u.username, a.title as anime_title, a.slug as anime_slug
     FROM comments c JOIN users u ON u.id=c.user_id JOIN anime a ON a.id=c.anime_id
     ORDER BY c.created_at DESC LIMIT 100`
  ).all()
  return c.render(<AdminLayout active="comments" user={user}>
    <h1 class="font-display text-4xl tracking-wider mb-6">Comment Moderation</h1>
    <div class="space-y-3">
      {comments.results.length === 0 && <div class="glass p-8 text-center text-av-muted">No comments yet.</div>}
      {(comments.results as any[]).map((cm) => (
        <div class="glass p-4 flex gap-3">
          <div class="flex-1">
            <div class="text-sm font-semibold">{cm.username} <span class="text-xs text-av-muted ml-2">on <a href={`/anime/${cm.anime_slug}`} class="text-av-orange">{cm.anime_title}</a></span></div>
            <p class="text-sm mt-1">{cm.content}</p>
            <div class="text-xs text-av-muted mt-1">{new Date(cm.created_at).toLocaleString()}</div>
          </div>
          <button onclick={`deleteCm(${cm.id})`} class="text-red-400 text-sm hover:underline self-start">Delete</button>
        </div>
      ))}
    </div>
    <script dangerouslySetInnerHTML={{ __html: `
      async function deleteCm(id){
        if(!confirm('Delete this comment?')) return;
        try { await window.api('/api/admin/comments/'+id,{method:'DELETE'}); location.reload(); }
        catch(e){ window.toast(e.message,'error'); }
      }
    ` }} />
  </AdminLayout>, { title: 'Admin • Comments', user })
})

// ====== Admin layout helpers ======
function AdminLayout({ children, active, user }: { children: any; active: string; user: any }) {
  return (
    <div class="pt-20">
      <div class="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 grid lg:grid-cols-[240px_1fr] gap-6">
        <aside class="lg:sticky lg:top-24 self-start">
          <div class="glass p-3">
            <div class="px-3 py-2 mb-2">
              <div class="text-xs text-av-muted uppercase tracking-wider">Admin</div>
              <div class="font-display text-xl tracking-wider">{user.username}</div>
            </div>
            <a href="/admin" class={`admin-link ${active === 'dashboard' ? 'active' : ''}`}><i class="fa-solid fa-gauge-high w-5"></i>Dashboard</a>
            <a href="/admin/anime" class={`admin-link ${active === 'anime' ? 'active' : ''}`}><i class="fa-solid fa-film w-5"></i>Anime</a>
            <a href="/admin/users" class={`admin-link ${active === 'users' ? 'active' : ''}`}><i class="fa-solid fa-users w-5"></i>Users</a>
            <a href="/admin/hero" class={`admin-link ${active === 'hero' ? 'active' : ''}`}><i class="fa-solid fa-image w-5"></i>Hero Slider</a>
            <a href="/admin/comments" class={`admin-link ${active === 'comments' ? 'active' : ''}`}><i class="fa-solid fa-comments w-5"></i>Comments</a>
            <a href="/admin/chat" class={`admin-link ${active === 'chat' ? 'active' : ''}`}><i class="fa-solid fa-gavel w-5"></i>Chat Moderation</a>
            <div class="h-px bg-av-line my-2"></div>
            <a href="/" class="admin-link"><i class="fa-solid fa-arrow-left w-5"></i>Back to site</a>
          </div>
        </aside>
        <div>{children}</div>
      </div>
      <div class="h-20"></div>
    </div>
  )
}

function StatCard({ i, l, v, sub }: { i: string; l: string; v: any; sub?: string }) {
  return (
    <div class="glass p-5">
      <i class={`fa-solid ${i} text-av-orange text-xl mb-3`}></i>
      <div class="text-3xl font-bold">{v}</div>
      <div class="text-xs text-av-muted uppercase tracking-wider">{l}</div>
      {sub && <div class="text-xs text-av-muted mt-1">{sub}</div>}
    </div>
  )
}

function AnimeForm({ action, method, data }: { action: string; method: string; data?: any }) {
  const d = data || {}
  return (
    <>
      <div class="mb-6">
        <a href="/admin/anime" class="text-sm text-av-muted hover:text-av-orange"><i class="fa-solid fa-arrow-left mr-1"></i>Back</a>
        <h1 class="font-display text-4xl tracking-wider mt-2">{data ? 'Edit Anime' : 'Add New Anime'}</h1>
      </div>
      <form id="animeform" class="glass p-6 space-y-4">
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Title *</label>
            <input name="title" required defaultValue={d.title} class="input-field pl-4" />
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Studio</label>
            <input name="studio" defaultValue={d.studio} class="input-field pl-4" />
          </div>
        </div>
        <div>
          <label class="text-xs uppercase tracking-wider text-av-muted">Description</label>
          <textarea name="description" rows={4} class="input-field pl-4">{d.description}</textarea>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Poster URL</label>
            <div class="flex gap-2">
              <input name="poster" id="poster-url" defaultValue={d.poster} class="input-field pl-4 flex-1" placeholder="https://... (Pinterest, TMDB, any)" />
              <button type="button" onclick="importImage('poster-url','poster-preview')" class="btn-ghost px-3 text-xs whitespace-nowrap" title="Download image to DB"><i class="fa-solid fa-cloud-arrow-down"></i></button>
            </div>
            <div class="drop-zone-preview mt-2" style="max-width:140px" id="poster-preview">
              {d.poster ? <img src={d.poster} alt="" onerror="this.style.display='none'" /> : null}
            </div>
            <div class="text-[10px] text-av-muted mt-1">Aspect 2:3 recommended. Click ↓ to import & store image permanently (works for Pinterest).</div>
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Banner URL</label>
            <div class="flex gap-2">
              <input name="banner" id="banner-url" defaultValue={d.banner} class="input-field pl-4 flex-1" placeholder="https://..." />
              <button type="button" onclick="importImage('banner-url','banner-preview')" class="btn-ghost px-3 text-xs whitespace-nowrap" title="Download image to DB"><i class="fa-solid fa-cloud-arrow-down"></i></button>
            </div>
            <div class="drop-zone-preview mt-2" style="max-width:280px" id="banner-preview">
              {d.banner ? <img src={d.banner} alt="" onerror="this.style.display='none'" /> : null}
            </div>
            <div class="text-[10px] text-av-muted mt-1">Wide 16:9 recommended (e.g. 1920×1080).</div>
          </div>
        </div>
        <div>
          <label class="text-xs uppercase tracking-wider text-av-muted">Trailer URL (YouTube/mp4)</label>
          <input name="trailer" defaultValue={d.trailer} class="input-field pl-4" />
        </div>
        <div>
          <label class="text-xs uppercase tracking-wider text-av-muted">Genres (comma-separated)</label>
          <input name="genres" defaultValue={d.genres} class="input-field pl-4" placeholder="Action, Fantasy, Adventure" />
        </div>
        <div class="grid md:grid-cols-4 gap-4">
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Year</label>
            <input name="release_year" type="number" defaultValue={d.release_year || new Date().getFullYear()} class="input-field pl-4" />
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Rating</label>
            <input name="rating" type="number" step="0.1" min="0" max="10" defaultValue={d.rating || 0} class="input-field pl-4" />
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Type</label>
            <select name="type" class="input-field pl-4">
              {['TV','MOVIE','OVA'].map((t) => <option value={t} selected={d.type === t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-av-muted">Status</label>
            <select name="status" class="input-field pl-4">
              {['ONGOING','COMPLETED','UPCOMING'].map((s) => <option value={s} selected={d.status === s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_premium" defaultChecked={!!d.is_premium} />Premium</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_vip" defaultChecked={!!d.is_vip} />VIP Only</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_featured" defaultChecked={!!d.is_featured} />Featured</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_trending" defaultChecked={!!d.is_trending} />Trending</label>
        </div>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i>{data ? 'Save Changes' : 'Create Anime'}</button>
      </form>
      <script dangerouslySetInnerHTML={{ __html: `
        // Live image preview
        function bindPreview(inputId, previewId) {
          const inp = document.getElementById(inputId);
          const prev = document.getElementById(previewId);
          if (!inp || !prev) return;
          inp.addEventListener('input', () => {
            const url = inp.value.trim();
            if (!url) { prev.innerHTML = ''; return; }
            prev.innerHTML = '<img src="' + url.replace(/"/g, '&quot;') + '" onerror="this.parentNode.innerHTML=\\'<div class=&quot;p-3 text-xs text-red-400&quot;>Image failed to load</div>\\'"/>';
          });
        }
        bindPreview('poster-url', 'poster-preview');
        bindPreview('banner-url', 'banner-preview');

        window.importImage = async function(inputId, previewId) {
          const inp = document.getElementById(inputId);
          const url = (inp.value || '').trim();
          if (!url) { window.toast('Paste an image URL first','error'); return; }
          window.toast('Importing image — please wait...', 'info');
          try {
            const r = await window.api('/api/admin/upload/image-from-url', { method:'POST', body: { url } });
            inp.value = r.url;
            inp.dispatchEvent(new Event('input'));
            window.toast('Imported (' + (r.size/1024).toFixed(0) + ' KB) - image is now stored permanently','success');
          } catch(e) { window.toast(e.message || 'Import failed','error'); }
        }

        document.getElementById('animeform').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const body = {};
          fd.forEach((v,k) => body[k] = v);
          body.is_premium = fd.get('is_premium') ? 1 : 0;
          body.is_vip = fd.get('is_vip') ? 1 : 0;
          body.is_featured = fd.get('is_featured') ? 1 : 0;
          body.is_trending = fd.get('is_trending') ? 1 : 0;
          try {
            const r = await window.api('${action}', { method: '${method}', body });
            window.toast('Saved!', 'success');
            setTimeout(() => location.href = '/admin/anime', 600);
          } catch(err){ window.toast(err.message,'error'); }
        });
      ` }} />
    </>
  )
}

// =====================================================
//  PROFILES — Netflix-style multi-profile selector
// =====================================================
app.get('/profiles', requireAuth, async (c) => {
  const user = c.get('user')!
  const r = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE user_id = ? ORDER BY is_main DESC, created_at ASC'
  ).bind(user.id).all()
  const profiles = (r.results || []) as any[]
  // Keep in sync with /api/profiles POST limit logic
  const limit = user.isAdmin ? 50 : user.isVip ? 10 : user.isPremium ? 5 : 2

  return c.render(
    <div class="profile-selector min-h-screen pt-32 pb-20 px-6">
      <div class="max-w-5xl mx-auto text-center">
        <div class="text-xs uppercase tracking-[0.3em] text-av-orange mb-3">AniVerse</div>
        <h1 class="font-display text-5xl sm:text-6xl tracking-wider mb-3">Who's Watching?</h1>
        <p class="text-av-muted mb-12">Select a profile to continue. Each profile has its own watch history, favorites & recommendations.</p>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 sm:gap-10 justify-items-center">
          {profiles.map((p: any) => (
            <button
              class={`profile-tile group theme-${p.theme || 'default'}`}
              data-profile-id={p.id}
              data-profile-pin={p.pin ? '1' : ''}
              data-profile-name={p.name}
            >
              <div class={`profile-avatar ${p.is_kids ? 'is-kids' : ''}`}>
                {p.avatar
                  ? <img src={p.avatar} alt="" onerror="this.style.display='none'" />
                  : <span class="font-display text-4xl">{(p.name || '?').slice(0, 1).toUpperCase()}</span>}
                {p.pin ? <div class="profile-lock"><i class="fa-solid fa-lock"></i></div> : null}
                {p.is_kids ? <div class="profile-kids-tag">KIDS</div> : null}
              </div>
              <div class="mt-3 font-semibold group-hover:text-av-orange transition">{p.name}</div>
              {p.bio ? <div class="text-xs text-av-muted line-clamp-1 mt-1 max-w-[140px]">{p.bio}</div> : null}
            </button>
          ))}

          {profiles.length < limit && (
            <a href="/profiles/new" class="profile-tile profile-tile-add group">
              <div class="profile-avatar profile-avatar-add">
                <i class="fa-solid fa-plus text-4xl"></i>
              </div>
              <div class="mt-3 font-semibold text-av-muted group-hover:text-av-orange transition">Add Profile</div>
            </a>
          )}
        </div>

        <div class="mt-6 text-xs text-av-muted">
          {profiles.length}/{user.isAdmin ? '∞' : limit} profiles used · {user.isAdmin ? 'Unlimited' : user.isVip ? 'VIP plan allows 10' : user.isPremium ? 'Premium plan allows 5' : 'Free plan allows 2'}
          {!user.isPremium && !user.isAdmin && <> · <a href="/membership" class="text-av-orange hover:underline">Upgrade for more</a></>}
        </div>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href="/profiles/manage" class="btn-ghost"><i class="fa-solid fa-pen"></i>Manage Profiles</a>
          <a href="/" class="btn-ghost"><i class="fa-solid fa-house"></i>Continue with Current</a>
        </div>
      </div>

      {/* PIN modal */}
      <div id="pin-modal" class="fixed inset-0 z-[120] hidden items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/85 backdrop-blur-md" data-close-pin></div>
        <div class="relative w-full max-w-sm bg-av-card border border-av-line rounded-3xl p-8 text-center">
          <button class="absolute top-4 right-4 w-9 h-9 rounded-full bg-av-bg/80 grid place-items-center" data-close-pin><i class="fa-solid fa-xmark"></i></button>
          <i class="fa-solid fa-lock text-3xl text-av-orange mb-3"></i>
          <h3 class="font-display text-2xl tracking-wider mb-1" id="pin-profile-name">Enter PIN</h3>
          <p class="text-av-muted text-sm mb-5">This profile is protected.</p>
          <input id="pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="w-full text-center text-3xl tracking-[1em] py-3 bg-av-bg border border-av-line rounded-2xl focus:outline-none focus:border-av-orange" />
          <button id="pin-submit" class="btn-primary w-full mt-4"><i class="fa-solid fa-unlock"></i>Unlock</button>
          <div id="pin-error" class="text-red-400 text-xs mt-2 hidden">Wrong PIN, try again</div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          let activeId = null;
          function selectProfile(id, pin){
            fetch('/api/profiles/' + id + '/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: pin || '' })
            }).then(r => r.json()).then(d => {
              if (d.ok) {
                window.location.href = '/';
              } else {
                document.getElementById('pin-error').classList.remove('hidden');
              }
            });
          }
          document.querySelectorAll('[data-profile-id]').forEach(el => {
            el.addEventListener('click', (e) => {
              const id = el.dataset.profileId;
              const needsPin = el.dataset.profilePin === '1';
              const name = el.dataset.profileName;
              if (needsPin) {
                activeId = id;
                document.getElementById('pin-profile-name').textContent = name;
                document.getElementById('pin-modal').classList.remove('hidden');
                document.getElementById('pin-modal').classList.add('flex');
                document.getElementById('pin-input').value = '';
                document.getElementById('pin-input').focus();
              } else {
                selectProfile(id);
              }
            });
          });
          document.querySelectorAll('[data-close-pin]').forEach(el => {
            el.addEventListener('click', () => {
              document.getElementById('pin-modal').classList.add('hidden');
              document.getElementById('pin-modal').classList.remove('flex');
              document.getElementById('pin-error').classList.add('hidden');
            });
          });
          document.getElementById('pin-submit').addEventListener('click', () => {
            selectProfile(activeId, document.getElementById('pin-input').value);
          });
          document.getElementById('pin-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') selectProfile(activeId, e.target.value);
          });
        })();
      ` }} />
    </div>,
    { title: 'Who\'s Watching?', user, hideNav: true }
  )
})

// New profile form
app.get('/profiles/new', requireAuth, async (c) => {
  const user = c.get('user')!
  return c.render(<ProfileEditPage user={user} profile={null} />, { title: 'New Profile', user })
})

// Edit profile form
app.get('/profiles/:id/edit', requireAuth, async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const profile = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first<any>()
  if (!profile) return c.notFound()
  return c.render(<ProfileEditPage user={user} profile={profile} />, { title: 'Edit Profile', user })
})

// Manage profiles
app.get('/profiles/manage', requireAuth, async (c) => {
  const user = c.get('user')!
  const r = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE user_id = ? ORDER BY is_main DESC, created_at ASC'
  ).bind(user.id).all()
  const profiles = (r.results || []) as any[]
  return c.render(
    <div class="pt-24 max-w-4xl mx-auto px-6">
      <div class="text-center mb-10">
        <h1 class="font-display text-5xl tracking-wider">Manage Profiles</h1>
        <p class="text-av-muted mt-2">Edit or delete your profiles</p>
      </div>
      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
        {profiles.map((p: any) => (
          <div class={`glass p-5 text-center theme-${p.theme}`}>
            <div class="profile-avatar mx-auto" style="width:96px;height:96px">
              {p.avatar ? <img src={p.avatar} alt="" onerror="this.style.display='none'" /> : <span class="font-display text-3xl">{(p.name || '?').slice(0, 1).toUpperCase()}</span>}
            </div>
            <div class="mt-3 font-semibold">{p.name}</div>
            <div class="text-xs text-av-muted">{p.is_kids ? 'KIDS' : p.is_main ? 'Main' : 'Profile'} {p.pin ? '• PIN' : ''}</div>
            <div class="flex gap-2 mt-3 justify-center">
              <a href={`/profiles/${p.id}/edit`} class="px-3 py-1.5 rounded-full bg-av-bg border border-av-line text-xs hover:border-av-orange transition">Edit</a>
              {!p.is_main && (
                <button data-delete-profile={p.id} class="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/20 transition">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div class="mt-8 text-center">
        <a href="/profiles" class="btn-ghost"><i class="fa-solid fa-arrow-left"></i>Back to Selector</a>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('[data-delete-profile]').forEach(b => {
          b.addEventListener('click', async () => {
            if (!confirm('Delete this profile? Watch history will be lost.')) return;
            const r = await fetch('/api/profiles/' + b.dataset.deleteProfile, { method: 'DELETE' });
            const d = await r.json();
            if (d.ok) location.reload(); else window.toast(d.error || 'Error', 'error');
          });
        });
      ` }} />
    </div>,
    { title: 'Manage Profiles', user }
  )
})

// =====================================================
//  FRIENDS PAGE
// =====================================================
app.get('/friends', requireAuth, async (c) => {
  const user = c.get('user')!
  return c.render(
    <div class="pt-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div class="text-xs uppercase tracking-wider text-av-orange">Community</div>
          <h1 class="font-display text-5xl tracking-wider">Friends</h1>
        </div>
        <div class="flex gap-2">
          <input id="friend-target" placeholder="Username or email" class="input-field pl-4" />
          <button id="friend-add" class="btn-primary"><i class="fa-solid fa-user-plus"></i>Add</button>
        </div>
      </div>

      <div id="incoming-list" class="mb-8"></div>
      <div id="sent-list" class="mb-8"></div>
      <div id="friends-list"></div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function loadFriends() {
          const r = await fetch('/api/friends');
          const d = await r.json();
          const inc = document.getElementById('incoming-list');
          const sent = document.getElementById('sent-list');
          const list = document.getElementById('friends-list');
          inc.innerHTML = '';
          sent.innerHTML = '';
          list.innerHTML = '';
          if (d.incoming.length) {
            inc.innerHTML = '<div class="section-title"><h2>Incoming Requests</h2></div>' +
              '<div class="grid sm:grid-cols-2 gap-3">' + d.incoming.map(f =>
                '<div class="glass p-4 flex items-center gap-3">' +
                  '<div class="w-12 h-12 rounded-full bg-av-bg grid place-items-center font-bold border border-av-line">' +
                  (f.avatar ? '<img src="'+f.avatar+'" class="w-full h-full rounded-full object-cover" onerror="this.style.display=\\'none\\'"/>' : f.username[0].toUpperCase()) +
                  '</div>' +
                  '<div class="flex-1 min-w-0"><div class="font-semibold truncate">'+f.username+'</div><div class="text-xs text-av-muted uppercase">'+f.role+'</div></div>' +
                  '<button data-accept="'+f.request_id+'" class="btn-primary !py-1.5 !px-3 !text-xs"><i class="fa-solid fa-check"></i></button>' +
                  '<button data-decline="'+f.request_id+'" class="btn-ghost !py-1.5 !px-3 !text-xs"><i class="fa-solid fa-xmark"></i></button>' +
                '</div>'
              ).join('') + '</div>';
          }
          if (d.sent.length) {
            sent.innerHTML = '<div class="section-title"><h2>Sent Requests</h2></div>' +
              '<div class="grid sm:grid-cols-2 gap-3">' + d.sent.map(f =>
                '<div class="glass p-4 flex items-center gap-3 opacity-70">' +
                  '<div class="w-12 h-12 rounded-full bg-av-bg grid place-items-center font-bold border border-av-line">'+f.username[0].toUpperCase()+'</div>' +
                  '<div class="flex-1"><div class="font-semibold">'+f.username+'</div><div class="text-xs text-av-muted">Pending…</div></div>' +
                  '<button data-decline="'+f.request_id+'" class="btn-ghost !py-1.5 !px-3 !text-xs"><i class="fa-solid fa-xmark"></i>Cancel</button>' +
                '</div>'
              ).join('') + '</div>';
          }
          list.innerHTML = '<div class="section-title"><h2>Friends ('+d.friends.length+')</h2></div>';
          if (d.friends.length === 0) {
            list.innerHTML += '<div class="text-center py-12 text-av-muted"><i class="fa-solid fa-user-group text-4xl mb-3 block"></i>No friends yet. Add some above!</div>';
          } else {
            list.innerHTML += '<div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3">' + d.friends.map(f =>
              '<div class="glass p-4 flex items-center gap-3">' +
                '<div class="w-12 h-12 rounded-full bg-av-bg grid place-items-center font-bold border-2 ' + (f.role === 'VIP' ? 'border-av-vip' : f.role === 'PREMIUM' ? 'border-av-orange' : 'border-av-line') + '">' +
                (f.avatar ? '<img src="'+f.avatar+'" class="w-full h-full rounded-full object-cover" onerror="this.style.display=\\'none\\'"/>' : f.username[0].toUpperCase()) +
                '</div>' +
                '<div class="flex-1 min-w-0"><div class="font-semibold truncate">'+f.username+'</div><div class="text-xs text-av-muted uppercase">'+f.role+'</div></div>' +
                '<button data-unfriend="'+f.id+'" class="text-av-muted hover:text-red-400 transition"><i class="fa-solid fa-user-minus"></i></button>' +
              '</div>'
            ).join('') + '</div>';
          }
          // wire up buttons
          list.querySelectorAll('[data-unfriend]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Remove this friend?')) return;
            await fetch('/api/friends/' + b.dataset.unfriend, { method: 'DELETE' });
            loadFriends();
          }));
          inc.querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', async () => {
            await fetch('/api/friends/accept/' + b.dataset.accept, { method: 'POST' });
            window.toast('Friend request accepted', 'success');
            loadFriends();
          }));
          inc.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', async () => {
            await fetch('/api/friends/decline/' + b.dataset.decline, { method: 'POST' });
            loadFriends();
          }));
          sent.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', async () => {
            await fetch('/api/friends/decline/' + b.dataset.decline, { method: 'POST' });
            loadFriends();
          }));
        }
        document.getElementById('friend-add').addEventListener('click', async () => {
          const t = document.getElementById('friend-target').value.trim();
          if (!t) return;
          try {
            const r = await window.api('/api/friends/request', { method: 'POST', body: { target: t } });
            window.toast('Friend request sent', 'success');
            document.getElementById('friend-target').value = '';
            loadFriends();
          } catch (err) { window.toast(err.message, 'error'); }
        });
        loadFriends();
      ` }} />
    </div>,
    { title: 'Friends', user }
  )
})

// =====================================================
//  CHAT PAGES
// =====================================================
app.get('/chat', requireAuth, async (c) => {
  // redirect to global channel
  return c.redirect('/chat/global')
})

app.get('/chat/:slug', requireAuth, async (c) => {
  const user = c.get('user')!
  const slug = c.req.param('slug')
  const channels = await c.env.DB.prepare('SELECT * FROM chat_channels ORDER BY sort_order ASC').all()
  const currentCh = (channels.results as any[]).find((ch: any) => ch.slug === slug)
  if (!currentCh) return c.notFound()

  // gate access at SSR
  const canAccess =
    currentCh.required_role === 'USER' ||
    (currentCh.required_role === 'PREMIUM' && (user.isPremium || user.isAdmin)) ||
    (currentCh.required_role === 'VIP' && (user.isVip || user.isAdmin)) ||
    (currentCh.required_role === 'ADMIN' && user.isAdmin)

  return c.render(
    <div class="chat-app pt-16">
      <div class="chat-layout">
        {/* Sidebar */}
        <aside class="chat-sidebar">
          <div class="px-4 py-4 border-b border-av-line">
            <div class="text-xs uppercase tracking-wider text-av-muted">AniVerse</div>
            <div class="font-display text-2xl tracking-wider">Community</div>
          </div>
          <div class="p-2 space-y-1 flex-1 overflow-y-auto">
            <div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-av-muted">Channels</div>
            {(channels.results as any[]).map((ch: any) => {
              const access =
                ch.required_role === 'USER' ||
                (ch.required_role === 'PREMIUM' && (user.isPremium || user.isAdmin)) ||
                (ch.required_role === 'VIP' && (user.isVip || user.isAdmin)) ||
                (ch.required_role === 'ADMIN' && user.isAdmin)
              return (
                <a href={access ? `/chat/${ch.slug}` : '#'}
                   data-locked={!access ? '' : undefined}
                   class={`chat-channel-link ${ch.slug === slug ? 'active' : ''} ${!access ? 'opacity-50' : ''}`}>
                  <i class={`fa-solid ${ch.icon}`}></i>
                  <span class="flex-1 truncate">{ch.name}</span>
                  {ch.required_role === 'PREMIUM' && !access && <i class="fa-solid fa-crown text-av-orange text-xs"></i>}
                  {ch.required_role === 'VIP' && !access && <i class="fa-solid fa-gem text-av-vip text-xs"></i>}
                  {ch.locked ? <i class="fa-solid fa-lock text-av-muted text-xs"></i> : null}
                </a>
              )
            })}
            <div class="px-3 pt-5 pb-1 text-[10px] uppercase tracking-wider text-av-muted">Quick Links</div>
            <a href="/friends" class="chat-channel-link"><i class="fa-solid fa-user-group"></i><span class="flex-1">Friends</span></a>
            <a href="/" class="chat-channel-link"><i class="fa-solid fa-house"></i><span class="flex-1">Back to AniVerse</span></a>
          </div>
          <div class="p-3 border-t border-av-line flex items-center gap-2">
            <div class={`w-10 h-10 rounded-full grid place-items-center font-bold border-2 bg-av-card ${
              user.isVip ? 'border-av-vip' : user.isPremium ? 'border-av-orange' : 'border-av-line'
            }`}>
              {user.avatar ? <img src={user.avatar} class="w-full h-full rounded-full object-cover" /> : user.username[0].toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold truncate">{user.username}</div>
              <div class="text-xs text-av-muted truncate">{user.role}</div>
            </div>
            {user.isAdmin && <a href="/admin/chat" class="text-av-muted hover:text-red-400 transition" title="Admin"><i class="fa-solid fa-shield-halved"></i></a>}
          </div>
        </aside>

        {/* Main */}
        <main class="chat-main">
          <header class="chat-header">
            <button class="md:hidden chat-burger" data-toggle-sidebar><i class="fa-solid fa-bars"></i></button>
            <i class={`fa-solid ${currentCh.icon} text-av-orange`}></i>
            <div>
              <div class="font-display text-2xl tracking-wider"># {currentCh.name}</div>
              <div class="text-xs text-av-muted">{currentCh.description}</div>
            </div>
            <div class="ml-auto flex items-center gap-2">
              <button class="chat-icon-btn md:hidden" data-toggle-online><i class="fa-solid fa-users"></i></button>
              {currentCh.locked ? <span class="text-xs uppercase text-av-muted"><i class="fa-solid fa-lock"></i> Locked</span> : null}
            </div>
          </header>

          {!canAccess ? (
            <div class="flex-1 grid place-items-center p-8 text-center">
              <div>
                <i class="fa-solid fa-lock text-5xl text-av-orange mb-4"></i>
                <h2 class="font-display text-3xl tracking-wider mb-2">{currentCh.required_role} Only</h2>
                <p class="text-av-muted mb-4">Upgrade to join this exclusive channel.</p>
                <a href="/membership" class="btn-primary"><i class="fa-solid fa-crown"></i>Upgrade</a>
              </div>
            </div>
          ) : (
            <>
              <div id="chat-messages" class="chat-messages" data-channel={slug}>
                <div class="text-center text-av-muted py-10 text-sm" id="chat-loading">
                  <i class="fa-solid fa-spinner fa-spin text-xl mb-2 block"></i>Loading messages…
                </div>
              </div>
              <div id="chat-typing" class="chat-typing"></div>
              <form id="chat-form" class="chat-composer" data-channel={slug} data-locked={currentCh.locked && !user.isAdmin ? '1' : ''}>
                <button type="button" class="chat-icon-btn" id="emoji-btn" title="Emoji"><i class="fa-solid fa-face-smile"></i></button>
                <button type="button" class="chat-icon-btn" id="image-btn" title="Image URL"><i class="fa-solid fa-image"></i></button>
                <input
                  type="text"
                  id="chat-input"
                  placeholder={currentCh.locked && !user.isAdmin ? '🔒 Channel locked' : `Message #${currentCh.slug}`}
                  maxlength={2000}
                  autocomplete="off"
                  class="chat-input"
                  disabled={currentCh.locked && !user.isAdmin ? true : undefined}
                />
                <button type="submit" class="chat-send" disabled={currentCh.locked && !user.isAdmin ? true : undefined}><i class="fa-solid fa-paper-plane"></i></button>
              </form>
            </>
          )}
        </main>

        {/* Online users */}
        <aside class="chat-online" id="chat-online-panel">
          <div class="px-4 py-4 border-b border-av-line flex items-center justify-between">
            <div>
              <div class="text-xs uppercase tracking-wider text-av-muted">Online</div>
              <div class="font-display text-xl tracking-wider" id="online-count">—</div>
            </div>
            <button class="md:hidden chat-icon-btn" data-toggle-online><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="online-list" class="p-2 space-y-1 flex-1 overflow-y-auto text-sm"></div>
        </aside>
      </div>

      {/* Emoji picker */}
      <div id="emoji-picker" class="emoji-picker hidden">
        {['😀','😂','😍','🥰','😎','🤩','😢','😭','😡','🤔','👍','👎','❤️','💔','🔥','🎉','💯','✨','⭐','🌟','💀','🤝','👀','🍿','🍣','🍜','🎌','⚔️','🛡️','🪄'].map(e => (
          <button class="emoji-tile" data-emoji={e}>{e}</button>
        ))}
      </div>

      <script src="/static/chat.js" defer></script>
    </div>,
    { title: `# ${currentCh.name}`, user, hideNav: true }
  )
})

// =====================================================
//  ADMIN CHAT MODERATION
// =====================================================
app.get('/admin/chat', requireAdmin, async (c) => {
  const user = c.get('user')!
  const channels = await c.env.DB.prepare('SELECT * FROM chat_channels ORDER BY sort_order ASC').all()
  const recentMsgs = await c.env.DB.prepare(
    `SELECT cm.id, cm.content, cm.deleted, cm.pinned, cm.created_at,
            u.id as user_id, u.username, u.role, cc.name as channel_name, cc.slug as channel_slug
     FROM chat_messages cm
     JOIN users u ON u.id = cm.user_id
     JOIN chat_channels cc ON cc.id = cm.channel_id
     ORDER BY cm.id DESC LIMIT 50`
  ).all()
  const activeMutes = await c.env.DB.prepare(
    `SELECT cm.*, u.username FROM chat_mutes cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.muted_until > datetime('now') ORDER BY cm.muted_until DESC`
  ).all()
  return c.render(
    <AdminLayout active="chat" user={user}>
      <div class="mb-6 flex items-end justify-between flex-wrap gap-3">
        <h1 class="font-display text-4xl tracking-wider">Chat Moderation</h1>
        <button id="new-channel-btn" class="btn-primary"><i class="fa-solid fa-plus"></i>New Channel</button>
      </div>

      <div class="grid lg:grid-cols-2 gap-6">
        <div>
          <div class="section-title"><h2>Channels</h2></div>
          <div class="space-y-2">
            {(channels.results as any[]).map((ch: any) => (
              <div class="glass p-4 flex items-center gap-3">
                <i class={`fa-solid ${ch.icon} text-av-orange`}></i>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold">#{ch.name} <span class="text-xs text-av-muted uppercase ml-1">{ch.required_role}</span></div>
                  <div class="text-xs text-av-muted truncate">{ch.description}</div>
                </div>
                <button data-lock={ch.id} class={`px-3 py-1.5 rounded-full text-xs ${ch.locked ? 'bg-red-500/15 text-red-400' : 'bg-av-bg border border-av-line'} hover:bg-av-bg/70 transition`}>
                  <i class={`fa-solid ${ch.locked ? 'fa-lock' : 'fa-lock-open'}`}></i> {ch.locked ? 'Unlock' : 'Lock'}
                </button>
                <button data-delete-channel={ch.id} class="text-av-muted hover:text-red-400 transition"><i class="fa-solid fa-trash"></i></button>
              </div>
            ))}
          </div>

          <div class="section-title mt-8"><h2>Active Mutes</h2></div>
          {(activeMutes.results as any[]).length === 0 ? (
            <div class="text-av-muted text-sm">No active mutes</div>
          ) : (activeMutes.results as any[]).map((m: any) => (
            <div class="glass p-3 mb-2 flex items-center gap-3 text-sm">
              <i class="fa-solid fa-volume-xmark text-red-400"></i>
              <div class="flex-1"><b>{m.username}</b> — until {new Date(m.muted_until).toLocaleString()}</div>
              {m.reason ? <div class="text-xs text-av-muted">{m.reason}</div> : null}
            </div>
          ))}
        </div>

        <div>
          <div class="section-title"><h2>Recent Messages</h2></div>
          <div class="space-y-2 max-h-[700px] overflow-y-auto">
            {(recentMsgs.results as any[]).map((m: any) => (
              <div class={`glass p-3 text-sm ${m.deleted ? 'opacity-50' : ''}`}>
                <div class="flex items-center gap-2 text-xs text-av-muted mb-1">
                  <span class="font-semibold text-av-text">{m.username}</span>
                  <span>in #{m.channel_slug}</span>
                  <span>·</span>
                  <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                  {m.pinned ? <i class="fa-solid fa-thumbtack text-av-orange"></i> : null}
                </div>
                <div class={m.deleted ? 'italic' : ''}>{m.content}</div>
                <div class="flex gap-2 mt-2">
                  {!m.deleted && <button data-delete-msg={m.id} class="text-xs text-red-400 hover:underline">Delete</button>}
                  <button data-pin-msg={m.id} class="text-xs text-av-orange hover:underline">{m.pinned ? 'Unpin' : 'Pin'}</button>
                  <button data-mute={m.user_id} class="text-xs text-red-400 hover:underline">Mute user 10m</button>
                  <button data-mute-long={m.user_id} class="text-xs text-red-400 hover:underline">Mute 24h</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New channel modal */}
      <div id="ch-modal" class="fixed inset-0 z-[100] hidden items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-md" data-ch-close></div>
        <div class="relative w-full max-w-md bg-av-card rounded-3xl border border-av-line p-6">
          <h2 class="font-display text-2xl tracking-wider mb-4">New Channel</h2>
          <div class="space-y-3">
            <input id="ch-slug" placeholder="slug (e.g. anime-news)" class="input-field pl-4" />
            <input id="ch-name" placeholder="Display name" class="input-field pl-4" />
            <input id="ch-desc" placeholder="Description" class="input-field pl-4" />
            <input id="ch-icon" placeholder="Icon (e.g. fa-fire)" defaultValue="fa-hashtag" class="input-field pl-4" />
            <select id="ch-role" class="input-field pl-4">
              <option value="USER">All Users</option>
              <option value="PREMIUM">Premium+</option>
              <option value="VIP">VIP Only</option>
              <option value="ADMIN">Admin Only</option>
            </select>
          </div>
          <div class="flex gap-2 mt-5">
            <button id="ch-save" class="btn-primary flex-1">Create</button>
            <button data-ch-close class="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('[data-delete-msg]').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('Delete this message?')) return;
          await fetch('/api/chat/messages/' + b.dataset.deleteMsg, { method: 'DELETE' });
          location.reload();
        }));
        document.querySelectorAll('[data-pin-msg]').forEach(b => b.addEventListener('click', async () => {
          await fetch('/api/chat/messages/' + b.dataset.pinMsg + '/pin', { method: 'POST' });
          location.reload();
        }));
        document.querySelectorAll('[data-mute]').forEach(b => b.addEventListener('click', async () => {
          await window.api('/api/chat/admin/mute', { method: 'POST', body: { user_id: Number(b.dataset.mute), minutes: 10 } });
          window.toast('Muted 10 minutes', 'success');
        }));
        document.querySelectorAll('[data-mute-long]').forEach(b => b.addEventListener('click', async () => {
          await window.api('/api/chat/admin/mute', { method: 'POST', body: { user_id: Number(b.dataset.muteLong), minutes: 60 * 24 } });
          window.toast('Muted 24 hours', 'success');
        }));
        document.querySelectorAll('[data-lock]').forEach(b => b.addEventListener('click', async () => {
          await fetch('/api/chat/admin/channels/' + b.dataset.lock + '/lock', { method: 'POST' });
          location.reload();
        }));
        document.querySelectorAll('[data-delete-channel]').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('Delete this channel? All messages will be lost.')) return;
          await fetch('/api/chat/admin/channels/' + b.dataset.deleteChannel, { method: 'DELETE' });
          location.reload();
        }));
        const modal = document.getElementById('ch-modal');
        document.getElementById('new-channel-btn').addEventListener('click', () => { modal.classList.remove('hidden'); modal.classList.add('flex'); });
        document.querySelectorAll('[data-ch-close]').forEach(b => b.addEventListener('click', () => { modal.classList.add('hidden'); modal.classList.remove('flex'); }));
        document.getElementById('ch-save').addEventListener('click', async () => {
          try {
            await window.api('/api/chat/admin/channels', { method: 'POST', body: {
              slug: document.getElementById('ch-slug').value,
              name: document.getElementById('ch-name').value,
              description: document.getElementById('ch-desc').value,
              icon: document.getElementById('ch-icon').value,
              required_role: document.getElementById('ch-role').value,
            }});
            window.toast('Channel created', 'success');
            location.reload();
          } catch(err) { window.toast(err.message, 'error'); }
        });
      ` }} />
    </AdminLayout>,
    { title: 'Admin • Chat', user }
  )
})

// 404
app.notFound((c) => c.render(
  <div class="pt-32 text-center px-6">
    <div class="font-display text-9xl text-av-orange">404</div>
    <p class="text-av-muted mb-6">This page lost its way in the AniVerse.</p>
    <a href="/" class="btn-primary"><i class="fa-solid fa-house"></i>Back Home</a>
  </div>, { title: '404' }
))

// =====================================================
//  ProfileEditPage component
// =====================================================
function ProfileEditPage({ user, profile }: { user: any; profile: any }) {
  const p = profile || { name: '', avatar: '', banner: '', bio: '', is_kids: 0, theme: 'default', pin: '' }
  const isEdit = !!profile
  const themes = [
    { id: 'default', name: 'Classic', color: '#ff7a18' },
    { id: 'sakura', name: 'Sakura', color: '#ff7eb9' },
    { id: 'neon', name: 'Neon', color: '#00d4ff' },
    { id: 'midnight', name: 'Midnight', color: '#7c5cff' },
    { id: 'vip', name: 'VIP Gold', color: '#ffc857', premium: true },
  ]
  // curated avatar suggestions
  const avatars = [
    'https://api.dicebear.com/7.x/anime/svg?seed=Naruto&backgroundColor=ff7a18',
    'https://api.dicebear.com/7.x/anime/svg?seed=Luffy&backgroundColor=ff9a3c',
    'https://api.dicebear.com/7.x/anime/svg?seed=Sasuke&backgroundColor=7c5cff',
    'https://api.dicebear.com/7.x/anime/svg?seed=Hinata&backgroundColor=ff7eb9',
    'https://api.dicebear.com/7.x/anime/svg?seed=Gojo&backgroundColor=00d4ff',
    'https://api.dicebear.com/7.x/anime/svg?seed=Levi&backgroundColor=4a4a4a',
    'https://api.dicebear.com/7.x/anime/svg?seed=Eren&backgroundColor=c0392b',
    'https://api.dicebear.com/7.x/anime/svg?seed=Mikasa&backgroundColor=2c3e50',
    'https://api.dicebear.com/7.x/anime/svg?seed=Tanjiro&backgroundColor=2ecc71',
    'https://api.dicebear.com/7.x/anime/svg?seed=Nezuko&backgroundColor=e91e63',
    'https://api.dicebear.com/7.x/anime/svg?seed=Goku&backgroundColor=f39c12',
    'https://api.dicebear.com/7.x/anime/svg?seed=Light&backgroundColor=9b59b6',
  ]
  return (
    <div class="pt-24 max-w-3xl mx-auto px-6">
      <a href="/profiles/manage" class="text-sm text-av-muted hover:text-av-orange"><i class="fa-solid fa-arrow-left mr-1"></i>Back</a>
      <h1 class="font-display text-5xl tracking-wider mt-2 mb-1">{isEdit ? 'Edit Profile' : 'New Profile'}</h1>
      <p class="text-av-muted mb-8">Customize your watching experience</p>

      <form id="profile-form" class="glass p-6 space-y-5" data-id={isEdit ? profile.id : ''}>
        <div class="flex items-center gap-5">
          <div id="avatar-preview" class={`profile-avatar theme-${p.theme}`} style="width:120px;height:120px">
            {p.avatar ? <img src={p.avatar} alt="" /> : <span class="font-display text-4xl">{(p.name || '?').slice(0,1).toUpperCase()}</span>}
          </div>
          <div class="flex-1">
            <label class="text-xs uppercase tracking-wider text-av-muted">Profile Name *</label>
            <input id="pf-name" required maxlength="30" defaultValue={p.name} class="input-field pl-4" placeholder="Your Name" />
            <label class="text-xs uppercase tracking-wider text-av-muted mt-3 block">Bio</label>
            <input id="pf-bio" maxlength="200" defaultValue={p.bio} class="input-field pl-4" placeholder="Anime lover · One Piece for life" />
          </div>
        </div>

        <div>
          <label class="text-xs uppercase tracking-wider text-av-muted mb-2 block">Choose an Avatar</label>
          <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
            {avatars.map(a => (
              <button type="button" data-avatar={a} class={`avatar-tile ${p.avatar === a ? 'active' : ''}`}>
                <img src={a} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <label class="text-xs uppercase tracking-wider text-av-muted mt-3 block">Or paste any image URL</label>
          <input id="pf-avatar" defaultValue={p.avatar} class="input-field pl-4" placeholder="https://..." />
        </div>

        <div>
          <label class="text-xs uppercase tracking-wider text-av-muted mb-2 block">Banner URL (optional)</label>
          <input id="pf-banner" defaultValue={p.banner} class="input-field pl-4" placeholder="https://..." />
        </div>

        <div>
          <label class="text-xs uppercase tracking-wider text-av-muted mb-2 block">Theme</label>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {themes.map(t => (
              <button type="button" data-theme={t.id} class={`theme-tile ${p.theme === t.id ? 'active' : ''} ${t.premium && !user.isPremium ? 'locked' : ''}`}>
                <div class="w-full h-12 rounded-lg mb-1" style={`background:linear-gradient(135deg, ${t.color}, #fff2)`}></div>
                <div class="text-xs">{t.name}</div>
                {t.premium && !user.isPremium ? <i class="fa-solid fa-lock text-[10px] text-av-muted ml-1"></i> : null}
              </button>
            ))}
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <label class="flex items-center gap-3 glass p-3 cursor-pointer">
            <input type="checkbox" id="pf-kids" defaultChecked={!!p.is_kids} class="w-4 h-4 accent-av-orange" />
            <div>
              <div class="text-sm font-semibold">Kids Profile</div>
              <div class="text-xs text-av-muted">Restrict mature content</div>
            </div>
          </label>
          <label class="flex items-center gap-3 glass p-3">
            <i class="fa-solid fa-lock text-av-muted"></i>
            <div class="flex-1">
              <div class="text-sm font-semibold">4-Digit PIN (optional)</div>
              <div class="text-xs text-av-muted">Lock this profile</div>
            </div>
            <input id="pf-pin" inputmode="numeric" maxlength="4" defaultValue={p.pin} class="w-16 text-center bg-av-bg border border-av-line rounded-lg py-1" placeholder="0000" />
          </label>
        </div>

        <div class="flex gap-3">
          <button type="submit" class="btn-primary flex-1"><i class="fa-solid fa-floppy-disk"></i>{isEdit ? 'Save' : 'Create Profile'}</button>
          <a href="/profiles/manage" class="btn-ghost">Cancel</a>
        </div>
      </form>

      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          const form = document.getElementById('profile-form');
          const id = form.dataset.id;
          const preview = document.getElementById('avatar-preview');
          const avatarInput = document.getElementById('pf-avatar');
          let theme = ${JSON.stringify(p.theme || 'default')};

          function refreshPreview() {
            const url = avatarInput.value;
            const name = document.getElementById('pf-name').value || '?';
            preview.className = 'profile-avatar theme-' + theme;
            preview.style.width = '120px';
            preview.style.height = '120px';
            preview.innerHTML = url
              ? '<img src="'+url+'" onerror="this.style.display=\\'none\\'; this.parentNode.innerHTML=\\'<span class=&quot;font-display text-4xl&quot;>'+name.slice(0,1).toUpperCase()+'</span>\\'"/>'
              : '<span class="font-display text-4xl">'+name.slice(0,1).toUpperCase()+'</span>';
          }

          document.querySelectorAll('[data-avatar]').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('[data-avatar]').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            avatarInput.value = b.dataset.avatar;
            refreshPreview();
          }));
          avatarInput.addEventListener('input', refreshPreview);
          document.getElementById('pf-name').addEventListener('input', refreshPreview);

          document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
            if (b.classList.contains('locked')) { window.toast('Theme requires Premium','error'); return; }
            document.querySelectorAll('[data-theme]').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            theme = b.dataset.theme;
            refreshPreview();
          }));

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = {
              name: document.getElementById('pf-name').value.trim(),
              avatar: avatarInput.value.trim(),
              banner: document.getElementById('pf-banner').value.trim(),
              bio: document.getElementById('pf-bio').value.trim(),
              is_kids: document.getElementById('pf-kids').checked,
              theme: theme,
              pin: document.getElementById('pf-pin').value.trim(),
            };
            if (!body.name) { window.toast('Name required','error'); return; }
            try {
              if (id) {
                await window.api('/api/profiles/' + id, { method: 'PUT', body });
                window.toast('Profile saved!','success');
              } else {
                await window.api('/api/profiles', { method: 'POST', body });
                window.toast('Profile created!','success');
              }
              setTimeout(() => location.href = '/profiles', 600);
            } catch(err) { window.toast(err.message,'error'); }
          });
        })();
      ` }} />
    </div>
  )
}

export default app
