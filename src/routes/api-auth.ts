import { Hono } from 'hono'
import type { Bindings, User, Variables } from '../lib/types'
import {
  hashPassword,
  verifyPassword,
  signJWT,
  setAuthCookie,
  clearAuthCookie,
  buildSessionUser,
} from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Permanent admin emails — granted ADMIN automatically on registration
const PERMANENT_ADMIN_EMAILS = ['shadow@gmail.com']

// REGISTER
app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null) as any
  if (!body) return c.json({ error: 'Invalid request' }, 400)
  const { email, username, password } = body
  if (!email || !username || !password) return c.json({ error: 'All fields are required' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Invalid email format' }, 400)
  if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)
  if (username.length < 3) return c.json({ error: 'Username must be at least 3 characters' }, 400)

  // Check existing (case-insensitive)
  const emailLower = String(email).toLowerCase().trim()
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?'
  ).bind(emailLower, String(username).toLowerCase()).first()
  if (existing) return c.json({ error: 'Email or username already exists' }, 409)

  // Check if email is in admin_emails table (DB-driven admin grant)
  let isAdmin = PERMANENT_ADMIN_EMAILS.includes(emailLower)
  if (!isAdmin) {
    try {
      const adminRow = await c.env.DB.prepare(
        'SELECT email FROM admin_emails WHERE email = ?'
      ).bind(emailLower).first()
      isAdmin = !!adminRow
    } catch { /* table may not exist */ }
  }
  const role = isAdmin ? 'ADMIN' : 'USER'
  const membershipType = isAdmin ? 'VIP' : 'FREE'
  const premiumUntil = isAdmin ? '2099-12-31T23:59:59Z' : null

  const hash = await hashPassword(password)
  const result = await c.env.DB.prepare(
    `INSERT INTO users (email, username, password_hash, role, is_admin, membership_type, premium_until)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    emailLower, username, hash, role,
    isAdmin ? 1 : 0, membershipType, premiumUntil
  ).run()

  const userId = result.meta.last_row_id as number

  // Auto-create main profile for the new user
  try {
    await c.env.DB.prepare(
      `INSERT INTO profiles (user_id, name, avatar, is_main) VALUES (?, ?, ?, 1)`
    ).bind(userId, username, '').run()
  } catch { /* profiles table may not exist */ }

  const token = await signJWT({ id: userId }, c.env.JWT_SECRET)
  setAuthCookie(c, token)

  // Build a real session user object for response
  const fullUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId).first<User>()
  return c.json({ ok: true, user: fullUser ? buildSessionUser(fullUser) : null })
})

// LOGIN — accepts email OR username in the "email" field (for flexibility)
app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null) as any
  if (!body) return c.json({ error: 'Invalid request' }, 400)
  // Accept either `email`, `username`, or `identifier`
  const identifier = String(body.email || body.identifier || body.username || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!identifier || !password) return c.json({ error: 'Email and password required' }, 400)

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?'
  ).bind(identifier, identifier).first<User>()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  if (user.banned) return c.json({ error: 'Account banned' }, 403)

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) return c.json({ error: 'Invalid credentials' }, 401)

  // Auto-restore admin role for permanent admin emails (defense in depth)
  const emailLower = String(user.email).toLowerCase()
  let shouldBeAdmin = PERMANENT_ADMIN_EMAILS.includes(emailLower)
  if (!shouldBeAdmin) {
    try {
      const adminRow = await c.env.DB.prepare(
        'SELECT email FROM admin_emails WHERE email = ?'
      ).bind(emailLower).first()
      shouldBeAdmin = !!adminRow
    } catch { /* ignore */ }
  }
  if (shouldBeAdmin && (user.role !== 'ADMIN' || !user.is_admin)) {
    await c.env.DB.prepare(
      `UPDATE users SET role = 'ADMIN', is_admin = 1,
       premium_until = COALESCE(premium_until, '2099-12-31T23:59:59Z'), banned = 0
       WHERE id = ?`
    ).bind(user.id).run()
    user.role = 'ADMIN'
    user.is_admin = 1
    if (!user.premium_until) user.premium_until = '2099-12-31T23:59:59Z'
  }

  const token = await signJWT({ id: user.id }, c.env.JWT_SECRET)
  setAuthCookie(c, token)
  return c.json({ ok: true, user: buildSessionUser(user) })
})

// LOGOUT — supports both POST (forms) and GET (fallback for direct links)
//   - If the request expects JSON (XHR/fetch), respond with JSON
//   - Otherwise issue a redirect to "/" so a plain <form> still works
async function handleLogout(c: any) {
  clearAuthCookie(c)
  const accept = String(c.req.header('accept') || '')
  const xrw = String(c.req.header('x-requested-with') || '').toLowerCase()
  const wantsJson = accept.includes('application/json') || xrw === 'fetch' || xrw === 'xmlhttprequest'
  if (wantsJson) {
    return c.json({ ok: true, loggedOut: true })
  }
  return c.redirect('/')
}
app.post('/logout', handleLogout)
app.get('/logout', handleLogout)

// ME — used by the client to poll real-time membership status
app.get('/me', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ user: null })
  return c.json({ user })
})

export default app
