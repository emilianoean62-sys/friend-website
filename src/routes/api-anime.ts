import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Browse anime (with filters)
app.get('/', async (c) => {
  const q = c.req.query('q') || ''
  const genre = c.req.query('genre') || ''
  const year = c.req.query('year') || ''
  const sort = c.req.query('sort') || 'newest'
  const limit = Math.min(Number(c.req.query('limit') || 24), 60)
  const offset = Number(c.req.query('offset') || 0)

  const where: string[] = []
  const params: any[] = []
  if (q) { where.push('(title LIKE ? OR description LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
  if (genre) { where.push('genres LIKE ?'); params.push(`%${genre}%`) }
  if (year) { where.push('release_year = ?'); params.push(Number(year)) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql =
    sort === 'rating' ? 'ORDER BY rating DESC' :
    sort === 'views'  ? 'ORDER BY views DESC' :
    sort === 'title'  ? 'ORDER BY title ASC' :
                        'ORDER BY created_at DESC'

  const res = await c.env.DB.prepare(
    `SELECT id, title, slug, poster, banner, genres, rating, views, is_premium, is_vip, release_year, type, status
     FROM anime ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all()
  return c.json({ anime: res.results })
})

// Get one (with episodes)
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const anime = await c.env.DB.prepare('SELECT * FROM anime WHERE slug = ?').bind(slug).first()
  if (!anime) return c.json({ error: 'Not found' }, 404)
  const eps = await c.env.DB.prepare(
    'SELECT * FROM episodes WHERE anime_id = ? ORDER BY number ASC'
  ).bind(anime.id).all()
  // bump views
  c.executionCtx?.waitUntil?.(
    c.env.DB.prepare('UPDATE anime SET views = views + 1 WHERE id = ?').bind(anime.id).run()
  )
  return c.json({ anime, episodes: eps.results })
})

export default app
