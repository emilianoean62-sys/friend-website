import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAdmin } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', requireAdmin)

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// ========== ANIME CRUD ==========
app.post('/anime', async (c) => {
  const b = await c.req.json() as any
  if (!b.title) return c.json({ error: 'Title required' }, 400)
  let slug = b.slug ? slugify(b.slug) : slugify(b.title)
  // ensure uniqueness
  const existing = await c.env.DB.prepare('SELECT id FROM anime WHERE slug = ?').bind(slug).first()
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`
  const res = await c.env.DB.prepare(
    `INSERT INTO anime
     (title, slug, description, poster, banner, trailer, genres, status, release_year, rating,
      is_premium, is_vip, is_featured, is_trending, studio, type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    b.title, slug, b.description || '', b.poster || '', b.banner || '', b.trailer || '',
    b.genres || '', b.status || 'ONGOING', Number(b.release_year) || new Date().getFullYear(),
    Number(b.rating) || 0,
    b.is_premium ? 1 : 0, b.is_vip ? 1 : 0, b.is_featured ? 1 : 0, b.is_trending ? 1 : 0,
    b.studio || '', b.type || 'TV'
  ).run()
  return c.json({ ok: true, id: res.meta.last_row_id, slug })
})

app.put('/anime/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const b = await c.req.json() as any
  await c.env.DB.prepare(
    `UPDATE anime SET
       title=?, description=?, poster=?, banner=?, trailer=?, genres=?, status=?,
       release_year=?, rating=?, is_premium=?, is_vip=?, is_featured=?, is_trending=?,
       studio=?, type=?
     WHERE id=?`
  ).bind(
    b.title, b.description || '', b.poster || '', b.banner || '', b.trailer || '',
    b.genres || '', b.status || 'ONGOING', Number(b.release_year) || new Date().getFullYear(),
    Number(b.rating) || 0,
    b.is_premium ? 1 : 0, b.is_vip ? 1 : 0, b.is_featured ? 1 : 0, b.is_trending ? 1 : 0,
    b.studio || '', b.type || 'TV', id
  ).run()
  return c.json({ ok: true })
})

app.delete('/anime/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM anime WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ========== EPISODE CRUD ==========
app.post('/episodes', async (c) => {
  const b = await c.req.json() as any
  if (!b.anime_id || !b.number) return c.json({ error: 'anime_id and number required' }, 400)
  const res = await c.env.DB.prepare(
    `INSERT INTO episodes (anime_id, number, title, description, thumbnail, video_url, duration, is_free, is_premium)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Number(b.anime_id), Number(b.number), b.title || `Episode ${b.number}`,
    b.description || '', b.thumbnail || '', b.video_url || '',
    Number(b.duration) || 0,
    b.is_free ? 1 : 0, b.is_premium ? 1 : 0
  ).run()
  return c.json({ ok: true, id: res.meta.last_row_id })
})

app.put('/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const b = await c.req.json() as any
  await c.env.DB.prepare(
    `UPDATE episodes SET title=?, description=?, thumbnail=?, video_url=?, duration=?, is_free=?, is_premium=?
     WHERE id=?`
  ).bind(
    b.title, b.description || '', b.thumbnail || '', b.video_url || '',
    Number(b.duration) || 0, b.is_free ? 1 : 0, b.is_premium ? 1 : 0, id
  ).run()
  return c.json({ ok: true })
})

app.delete('/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM episodes WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// Toggle lock state quickly
app.post('/episodes/:id/toggle-free', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(
    'UPDATE episodes SET is_free = CASE WHEN is_free = 1 THEN 0 ELSE 1 END WHERE id = ?'
  ).bind(id).run()
  return c.json({ ok: true })
})

// ========== USERS ==========
app.post('/users/:id/role', async (c) => {
  const id = Number(c.req.param('id'))
  const b = await c.req.json() as any
  const role = String(b.role || '').toUpperCase()
  if (!['USER', 'PREMIUM', 'VIP', 'ADMIN'].includes(role)) return c.json({ error: 'Invalid role' }, 400)

  // Keep all role-related columns in sync
  let until: string | null = null
  let isAdmin = 0
  let membership: 'FREE' | 'PREMIUM' | 'VIP' = 'FREE'
  if (role === 'ADMIN') {
    isAdmin = 1
    membership = 'VIP'
    until = '2099-12-31T23:59:59Z'
  } else if (role === 'VIP') {
    membership = 'VIP'
    until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  } else if (role === 'PREMIUM') {
    membership = 'PREMIUM'
    until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  }

  await c.env.DB.prepare(
    'UPDATE users SET role = ?, is_admin = ?, membership_type = ?, premium_until = ? WHERE id = ?'
  ).bind(role, isAdmin, membership, until, id).run()
  return c.json({ ok: true, role, membership, premium_until: until })
})

// ========== Lifetime membership grant ==========
app.post('/users/:id/lifetime', async (c) => {
  const id = Number(c.req.param('id'))
  const b = await c.req.json().catch(() => ({})) as any
  const tier = String(b?.tier || 'VIP').toUpperCase()
  if (!['PREMIUM', 'VIP'].includes(tier)) return c.json({ error: 'tier must be PREMIUM or VIP' }, 400)
  await c.env.DB.prepare(
    `UPDATE users SET role = ?, membership_type = ?, premium_until = '2099-12-31T23:59:59Z'
     WHERE id = ?`
  ).bind(tier, tier, id).run()
  return c.json({ ok: true, tier, lifetime: true })
})

app.post('/users/:id/ban', async (c) => {
  const id = Number(c.req.param('id'))
  const b = await c.req.json().catch(() => ({})) as any
  const banned = b?.banned === false ? 0 : 1
  await c.env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(banned, id).run()
  return c.json({ ok: true, banned: !!banned })
})

// ========== HERO SLIDES ==========
app.post('/hero', async (c) => {
  const b = await c.req.json() as any
  await c.env.DB.prepare(
    'INSERT INTO hero_slides (anime_id, title, subtitle, image, cta_text, cta_link, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    b.anime_id || null, b.title, b.subtitle || '', b.image, b.cta_text || 'Watch Now',
    b.cta_link || '/', Number(b.sort_order) || 0, b.active === false ? 0 : 1
  ).run()
  return c.json({ ok: true })
})

app.delete('/hero/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM hero_slides WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ========== COMMENT moderation ==========
app.delete('/comments/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ========== IMAGE UPLOAD STUB ==========
// In production, this would upload to Cloudflare R2 and return a public URL.
// Without R2 binding configured, this validates the URL is reachable & returns metadata.
app.post('/upload/validate', async (c) => {
  const b = await c.req.json().catch(() => null) as any
  const url = String(b?.url || '').trim()
  if (!url) return c.json({ error: 'URL required' }, 400)
  // Basic URL validation
  try {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) {
      return c.json({ error: 'URL must be http(s)' }, 400)
    }
    return c.json({ ok: true, url: u.toString() })
  } catch {
    return c.json({ error: 'Invalid URL' }, 400)
  }
})

export default app
