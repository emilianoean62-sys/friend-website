import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth, cookieSecure } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', requireAuth)

// List my profiles
app.get('/', async (c) => {
  const user = c.get('user')!
  const r = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE user_id = ? ORDER BY is_main DESC, created_at ASC'
  ).bind(user.id).all()
  return c.json({ profiles: r.results, activeId: user.activeProfileId || null })
})

// Create new profile
app.post('/', async (c) => {
  const user = c.get('user')!
  const b = await c.req.json().catch(() => null) as any
  if (!b?.name || String(b.name).length < 1) return c.json({ error: 'Name required' }, 400)

  // Profile limits per tier:
  //   FREE     → 2 profiles
  //   PREMIUM  → 5 profiles
  //   VIP      → 10 profiles
  //   ADMIN    → unlimited (cap at 50 to keep DB reasonable)
  const count = await c.env.DB.prepare('SELECT COUNT(*) as c FROM profiles WHERE user_id = ?').bind(user.id).first<any>()
  const limit = user.isAdmin ? 50 : user.isVip ? 10 : user.isPremium ? 5 : 2
  if ((count?.c || 0) >= limit) {
    return c.json({
      error: `Profile limit reached (${limit}/${limit}). ${user.isPremium ? '' : 'Upgrade to Premium for 5 profiles or VIP for 10.'}`.trim(),
      limit,
      current: count?.c || 0,
    }, 403)
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO profiles (user_id, name, avatar, bio, is_kids, theme, pin, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).bind(
    user.id,
    String(b.name).slice(0, 30),
    String(b.avatar || '').slice(0, 500),
    String(b.bio || '').slice(0, 200),
    b.is_kids ? 1 : 0,
    String(b.theme || 'default'),
    String(b.pin || '').slice(0, 4)
  ).run()
  return c.json({ ok: true, id: res.meta.last_row_id })
})

// Update profile
app.put('/:id', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const b = await c.req.json() as any
  const owned = await c.env.DB.prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?').bind(id, user.id).first()
  if (!owned) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare(
    `UPDATE profiles SET name=?, avatar=?, banner=?, bio=?, is_kids=?, theme=?, pin=? WHERE id=?`
  ).bind(
    String(b.name || '').slice(0, 30),
    String(b.avatar || '').slice(0, 500),
    String(b.banner || '').slice(0, 500),
    String(b.bio || '').slice(0, 200),
    b.is_kids ? 1 : 0,
    String(b.theme || 'default'),
    String(b.pin || '').slice(0, 4),
    id
  ).run()
  return c.json({ ok: true })
})

// Delete profile
app.delete('/:id', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const p = await c.env.DB.prepare('SELECT is_main FROM profiles WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>()
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (p.is_main) return c.json({ error: 'Cannot delete main profile' }, 400)
  await c.env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// Switch active profile
app.post('/:id/select', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const p = await c.env.DB.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>()
  if (!p) return c.json({ error: 'Not found' }, 404)
  // if has pin, require pin
  if (p.pin) {
    const b = await c.req.json().catch(() => ({})) as any
    if (b.pin !== p.pin) return c.json({ error: 'Wrong PIN' }, 403)
  }
  setCookie(c, 'aniverse_profile', String(id), {
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return c.json({ ok: true, profile: p })
})

export default app
