import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', requireAuth)

// Toggle favorite
app.post('/favorites/toggle', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null) as any
  const animeId = Number(body?.anime_id)
  if (!animeId) return c.json({ error: 'anime_id required' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM favorites WHERE user_id = ? AND anime_id = ?'
  ).bind(user.id, animeId).first()
  if (existing) {
    await c.env.DB.prepare('DELETE FROM favorites WHERE id = ?').bind(existing.id).run()
    return c.json({ favorited: false })
  }
  await c.env.DB.prepare(
    'INSERT INTO favorites (user_id, anime_id) VALUES (?, ?)'
  ).bind(user.id, animeId).run()
  return c.json({ favorited: true })
})

// Update watch progress
app.post('/watch/progress', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null) as any
  const animeId = Number(body?.anime_id)
  const episodeId = Number(body?.episode_id)
  const progress = Number(body?.progress || 0)
  const total = Number(body?.total || 0)
  if (!animeId || !episodeId) return c.json({ error: 'Missing data' }, 400)

  const completed = total > 0 && progress / total > 0.9 ? 1 : 0
  const profileId = user.activeProfileId || null

  await c.env.DB.prepare(
    `INSERT INTO watch_history (user_id, anime_id, episode_id, profile_id, progress_seconds, total_seconds, completed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, episode_id) DO UPDATE SET
       progress_seconds = excluded.progress_seconds,
       total_seconds = excluded.total_seconds,
       completed = excluded.completed,
       profile_id = excluded.profile_id,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(user.id, animeId, episodeId, profileId, progress, total, completed).run()

  return c.json({ ok: true })
})

// Post comment
app.post('/comments', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null) as any
  const animeId = Number(body?.anime_id)
  const content = String(body?.content || '').trim().slice(0, 1000)
  if (!animeId || !content) return c.json({ error: 'Missing data' }, 400)
  await c.env.DB.prepare(
    'INSERT INTO comments (user_id, anime_id, content) VALUES (?, ?, ?)'
  ).bind(user.id, animeId, content).run()
  return c.json({ ok: true })
})

// Update avatar
app.post('/profile/avatar', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null) as any
  const avatar = String(body?.avatar || '').slice(0, 500)
  await c.env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(avatar, user.id).run()
  return c.json({ ok: true })
})

export default app
