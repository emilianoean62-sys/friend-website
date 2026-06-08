import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', requireAuth)

// List my friends (accepted) + pending requests inbound + sent requests
app.get('/', async (c) => {
  const user = c.get('user')!
  const accepted = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.avatar, u.role, f.status
     FROM friends f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ? AND f.status = 'ACCEPTED'`
  ).bind(user.id).all()

  const incoming = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.avatar, u.role, f.id as request_id, f.created_at
     FROM friends f JOIN users u ON u.id = f.user_id
     WHERE f.friend_id = ? AND f.status = 'PENDING'`
  ).bind(user.id).all()

  const sent = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.avatar, u.role, f.id as request_id, f.created_at
     FROM friends f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ? AND f.status = 'PENDING'`
  ).bind(user.id).all()

  return c.json({
    friends: accepted.results,
    incoming: incoming.results,
    sent: sent.results,
  })
})

// Send friend request by username or email
app.post('/request', async (c) => {
  const user = c.get('user')!
  const b = await c.req.json().catch(() => null) as any
  const target = String(b?.target || '').trim().toLowerCase()
  if (!target) return c.json({ error: 'Username or email required' }, 400)
  const other = await c.env.DB.prepare(
    'SELECT id, username FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?'
  ).bind(target, target).first<any>()
  if (!other) return c.json({ error: 'User not found' }, 404)
  if (other.id === user.id) return c.json({ error: 'You cannot friend yourself' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
  ).bind(user.id, other.id, other.id, user.id).first<any>()
  if (existing) {
    if (existing.status === 'ACCEPTED') return c.json({ error: 'You are already friends' }, 400)
    return c.json({ error: 'Request already exists' }, 400)
  }

  await c.env.DB.prepare(
    'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)'
  ).bind(user.id, other.id, 'PENDING').run()

  // Notification
  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, '/friends')"
  ).bind(other.id, 'New friend request', `${user.username} sent you a friend request`).run()

  return c.json({ ok: true })
})

// Accept request (by request id)
app.post('/accept/:id', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const f = await c.env.DB.prepare(
    'SELECT * FROM friends WHERE id = ? AND friend_id = ? AND status = ?'
  ).bind(id, user.id, 'PENDING').first<any>()
  if (!f) return c.json({ error: 'Not found' }, 404)
  // mark accepted and create reverse row
  await c.env.DB.prepare('UPDATE friends SET status = ? WHERE id = ?').bind('ACCEPTED', id).run()
  // upsert reverse
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)'
  ).bind(user.id, f.user_id, 'ACCEPTED').run()
  await c.env.DB.prepare(
    'UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?'
  ).bind('ACCEPTED', user.id, f.user_id).run()

  // Notification
  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, '/friends')"
  ).bind(f.user_id, 'Friend request accepted', `${user.username} accepted your friend request`).run()

  return c.json({ ok: true })
})

// Decline / cancel request
app.post('/decline/:id', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare(
    'DELETE FROM friends WHERE id = ? AND (friend_id = ? OR user_id = ?)'
  ).bind(id, user.id, user.id).run()
  return c.json({ ok: true })
})

// Remove friend (deletes both rows)
app.delete('/:friendId', async (c) => {
  const user = c.get('user')!
  const fid = Number(c.req.param('friendId'))
  await c.env.DB.prepare(
    'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
  ).bind(user.id, fid, fid, user.id).run()
  return c.json({ ok: true })
})

// Public profile lookup (for viewing other users)
app.get('/user/:id', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  const u = await c.env.DB.prepare(
    'SELECT id, username, avatar, role, created_at FROM users WHERE id = ?'
  ).bind(id).first<any>()
  if (!u) return c.json({ error: 'Not found' }, 404)
  const status = await c.env.DB.prepare(
    'SELECT status FROM friends WHERE user_id = ? AND friend_id = ?'
  ).bind(user.id, id).first<any>()
  return c.json({ user: u, friend_status: status?.status || null })
})

export default app
