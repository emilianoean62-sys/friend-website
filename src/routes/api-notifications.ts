import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', requireAuth)

// List notifications
app.get('/', async (c) => {
  const user = c.get('user')!
  const r = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(user.id).all()
  const unread = await c.env.DB.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0'
  ).bind(user.id).first<any>()
  return c.json({ notifications: r.results, unread: unread?.c || 0 })
})

// Mark all read
app.post('/read-all', async (c) => {
  const user = c.get('user')!
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(user.id).run()
  return c.json({ ok: true })
})

// Mark one read
app.post('/:id/read', async (c) => {
  const user = c.get('user')!
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').bind(id, user.id).run()
  return c.json({ ok: true })
})

export default app
