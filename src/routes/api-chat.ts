import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth, requireAdmin } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ========== PUBLIC channel list (logged-in users only) ==========
app.get('/channels', requireAuth, async (c) => {
  const user = c.get('user')!
  const r = await c.env.DB.prepare('SELECT * FROM chat_channels ORDER BY sort_order ASC').all()
  const channels = (r.results as any[]).map((ch) => ({
    ...ch,
    accessible:
      ch.required_role === 'USER' ||
      (ch.required_role === 'PREMIUM' && (user.isPremium || user.isAdmin)) ||
      (ch.required_role === 'VIP' && (user.isVip || user.isAdmin)) ||
      (ch.required_role === 'ADMIN' && user.isAdmin),
  }))
  return c.json({ channels })
})

function canAccessChannel(channel: any, user: any) {
  if (channel.required_role === 'USER') return true
  if (channel.required_role === 'PREMIUM') return user.isPremium || user.isAdmin
  if (channel.required_role === 'VIP') return user.isVip || user.isAdmin
  if (channel.required_role === 'ADMIN') return user.isAdmin
  return false
}

async function isMuted(db: D1Database, userId: number) {
  const r = await db.prepare(
    "SELECT id FROM chat_mutes WHERE user_id = ? AND muted_until > datetime('now')"
  ).bind(userId).first()
  return !!r
}

// ========== GET messages ==========
app.get('/channels/:slug/messages', requireAuth, async (c) => {
  const user = c.get('user')!
  const slug = c.req.param('slug')
  const ch = await c.env.DB.prepare('SELECT * FROM chat_channels WHERE slug = ?').bind(slug).first<any>()
  if (!ch) return c.json({ error: 'Channel not found' }, 404)
  if (!canAccessChannel(ch, user)) return c.json({ error: 'No access to this channel' }, 403)
  const after = Number(c.req.query('after') || 0)

  const r = await c.env.DB.prepare(
    `SELECT cm.id, cm.content, cm.attachment_url, cm.attachment_type, cm.created_at, cm.pinned, cm.deleted, cm.reply_to,
            u.id as user_id, u.username, u.avatar, u.role,
            p.name as profile_name, p.avatar as profile_avatar
     FROM chat_messages cm
     JOIN users u ON u.id = cm.user_id
     LEFT JOIN profiles p ON p.id = cm.profile_id
     WHERE cm.channel_id = ? AND cm.id > ?
     ORDER BY cm.id ASC LIMIT 200`
  ).bind(ch.id, after).all()

  // get reactions
  const ids = (r.results as any[]).map((m) => m.id)
  let reactions: any[] = []
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',')
    const rr = await c.env.DB.prepare(
      `SELECT message_id, emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as users
       FROM chat_reactions WHERE message_id IN (${placeholders}) GROUP BY message_id, emoji`
    ).bind(...ids).all()
    reactions = rr.results as any[]
  }
  const reactMap: Record<number, any[]> = {}
  for (const r of reactions) {
    if (!reactMap[r.message_id]) reactMap[r.message_id] = []
    reactMap[r.message_id].push({
      emoji: r.emoji,
      count: r.count,
      users: String(r.users).split(',').map(Number),
    })
  }
  const messages = (r.results as any[]).map((m) => ({
    ...m,
    reactions: reactMap[m.id] || [],
  }))

  return c.json({ messages, channel: ch })
})

// ========== SEND message ==========
app.post('/channels/:slug/messages', requireAuth, async (c) => {
  const user = c.get('user')!
  const slug = c.req.param('slug')
  const ch = await c.env.DB.prepare('SELECT * FROM chat_channels WHERE slug = ?').bind(slug).first<any>()
  if (!ch) return c.json({ error: 'Channel not found' }, 404)
  if (!canAccessChannel(ch, user)) return c.json({ error: 'No access' }, 403)
  if (ch.locked && !user.isAdmin) return c.json({ error: 'Channel is locked' }, 403)
  if (await isMuted(c.env.DB, user.id)) return c.json({ error: 'You are muted' }, 403)

  const b = await c.req.json().catch(() => null) as any
  const content = String(b?.content || '').trim().slice(0, 2000)
  if (!content && !b?.attachment_url) return c.json({ error: 'Empty message' }, 400)

  // Profile id
  let profileId: number | null = null
  if (user.activeProfileId) {
    const p = await c.env.DB.prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?')
      .bind(user.activeProfileId, user.id).first()
    if (p) profileId = (p as any).id
  }

  // basic word filter
  const badWords = ['fuck', 'shit', 'bitch', 'cunt', 'asshole']
  let filtered = content
  for (const w of badWords) {
    const re = new RegExp(`\\b${w}\\b`, 'gi')
    filtered = filtered.replace(re, '*'.repeat(w.length))
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO chat_messages (channel_id, user_id, profile_id, content, attachment_url, attachment_type, reply_to)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ch.id, user.id, profileId, filtered,
    String(b.attachment_url || '').slice(0, 1000),
    String(b.attachment_type || '').slice(0, 20),
    b.reply_to ? Number(b.reply_to) : null
  ).run()

  // touch presence so user appears online
  await c.env.DB.prepare(
    `INSERT INTO chat_presence (user_id, channel_id, typing, last_seen)
     VALUES (?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET channel_id=excluded.channel_id, typing=0, last_seen=CURRENT_TIMESTAMP`
  ).bind(user.id, ch.id).run()

  return c.json({ ok: true, id: res.meta.last_row_id })
})

// ========== Delete own message ==========
app.delete('/messages/:id', requireAuth, async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const msg = await c.env.DB.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(id).first<any>()
  if (!msg) return c.json({ error: 'Not found' }, 404)
  if (msg.user_id !== user.id && !user.isAdmin) return c.json({ error: 'Forbidden' }, 403)
  await c.env.DB.prepare('UPDATE chat_messages SET deleted = 1, content = "[deleted]" WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ========== Pin message (admin) ==========
app.post('/messages/:id/pin', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(
    'UPDATE chat_messages SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END WHERE id = ?'
  ).bind(id).run()
  return c.json({ ok: true })
})

// ========== React to message ==========
app.post('/messages/:id/react', requireAuth, async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const b = await c.req.json() as any
  const emoji = String(b?.emoji || '').slice(0, 10)
  if (!emoji) return c.json({ error: 'Emoji required' }, 400)
  // Toggle
  const existing = await c.env.DB.prepare(
    'SELECT id FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).bind(id, user.id, emoji).first()
  if (existing) {
    await c.env.DB.prepare('DELETE FROM chat_reactions WHERE id = ?').bind((existing as any).id).run()
    return c.json({ reacted: false })
  }
  await c.env.DB.prepare(
    'INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'
  ).bind(id, user.id, emoji).run()
  return c.json({ reacted: true })
})

// ========== Typing indicator ==========
app.post('/channels/:slug/typing', requireAuth, async (c) => {
  const user = c.get('user')!
  const slug = c.req.param('slug')
  const ch = await c.env.DB.prepare('SELECT id FROM chat_channels WHERE slug = ?').bind(slug).first<any>()
  if (!ch) return c.json({ error: 'Channel not found' }, 404)
  await c.env.DB.prepare(
    `INSERT INTO chat_presence (user_id, channel_id, typing, last_seen)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET channel_id=?, typing=1, last_seen=CURRENT_TIMESTAMP`
  ).bind(user.id, ch.id, ch.id).run()
  return c.json({ ok: true })
})

// ========== Online users in a channel ==========
app.get('/channels/:slug/online', requireAuth, async (c) => {
  const slug = c.req.param('slug')
  const ch = await c.env.DB.prepare('SELECT id FROM chat_channels WHERE slug = ?').bind(slug).first<any>()
  if (!ch) return c.json({ error: 'Channel not found' }, 404)
  const r = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.avatar, u.role, p.typing
     FROM chat_presence p
     JOIN users u ON u.id = p.user_id
     WHERE p.channel_id = ? AND p.last_seen > datetime('now', '-2 minutes')
     ORDER BY u.role DESC, u.username ASC`
  ).bind(ch.id).all()
  return c.json({ online: r.results })
})

// ========== Heartbeat (mark online + get new messages) - acts as SSE-lite poll ==========
// Real "SSE" would tie up worker memory; we use 2-second client polling that feels real-time.
app.post('/heartbeat', requireAuth, async (c) => {
  const user = c.get('user')!
  const b = await c.req.json().catch(() => ({})) as any
  let channelId: number | null = null
  if (b?.channel_slug) {
    const ch = await c.env.DB.prepare('SELECT id FROM chat_channels WHERE slug = ?').bind(b.channel_slug).first<any>()
    if (ch) channelId = ch.id
  }
  await c.env.DB.prepare(
    `INSERT INTO chat_presence (user_id, channel_id, typing, last_seen)
     VALUES (?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET channel_id=?, last_seen=CURRENT_TIMESTAMP`
  ).bind(user.id, channelId, channelId).run()
  return c.json({ ok: true })
})

// ========== Admin: mute / ban from chat ==========
app.post('/admin/mute', requireAdmin, async (c) => {
  const admin = c.get('user')!
  const b = await c.req.json() as any
  const userId = Number(b?.user_id)
  const minutes = Number(b?.minutes || 10)
  if (!userId) return c.json({ error: 'user_id required' }, 400)
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString()
  await c.env.DB.prepare(
    'INSERT INTO chat_mutes (user_id, muted_until, reason, by_admin) VALUES (?, ?, ?, ?)'
  ).bind(userId, until, String(b?.reason || ''), admin.id).run()
  return c.json({ ok: true, until })
})

app.post('/admin/channels', requireAdmin, async (c) => {
  const b = await c.req.json() as any
  if (!b?.slug || !b?.name) return c.json({ error: 'slug and name required' }, 400)
  await c.env.DB.prepare(
    'INSERT INTO chat_channels (slug, name, description, icon, required_role, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    String(b.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    b.name,
    String(b.description || ''),
    String(b.icon || 'fa-hashtag'),
    String(b.required_role || 'USER'),
    Number(b.sort_order) || 0
  ).run()
  return c.json({ ok: true })
})

app.delete('/admin/channels/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM chat_channels WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

app.post('/admin/channels/:id/lock', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(
    'UPDATE chat_channels SET locked = CASE WHEN locked = 1 THEN 0 ELSE 1 END WHERE id = ?'
  ).bind(id).run()
  return c.json({ ok: true })
})

export default app
