import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Bindings, SessionUser, User, Variables } from './types'

// --- Web Crypto-based JWT (HS256) so we don't need Node crypto ---
function base64UrlEncode(data: ArrayBuffer | string): string {
  let bytes: Uint8Array
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data)
  } else {
    bytes = new Uint8Array(data)
  }
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function signJWT(payload: object, secret: string, expiresInSec = 60 * 60 * 24 * 30): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + expiresInSec }
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const bodyB64 = base64UrlEncode(JSON.stringify(body))
  const data = `${headerB64}.${bodyB64}`
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${base64UrlEncode(sig)}`
}

export async function verifyJWT<T = any>(token: string, secret: string): Promise<T | null> {
  try {
    const [h, p, s] = token.split('.')
    if (!h || !p || !s) return null
    const key = await hmacKey(secret)
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(s),
      new TextEncoder().encode(`${h}.${p}`)
    )
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(p)))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload as T
  } catch {
    return null
  }
}

// --- Password hashing (SHA-256 + salt; lightweight, works in CF Workers) ---
// In real production use bcrypt via a Worker-compatible lib; here we use a strong PBKDF2.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return `${base64UrlEncode(salt.buffer)}.${base64UrlEncode(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltB64, hashB64] = stored.split('.')
    if (!saltB64 || !hashB64) return false
    const salt = base64UrlDecode(saltB64)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    )
    const got = base64UrlEncode(bits)
    return got === hashB64
  } catch {
    return false
  }
}

// --- Helpers ---
// Hard-coded admin emails (defense in depth — DB also has admin_emails table)
// Anyone with these emails is always ADMIN, regardless of DB role column.
const PERMANENT_ADMIN_EMAILS = [
  'shadow@gmail.com',
  'emilianoean62@gmail.com',
]

function normEmail(e: string): string {
  return String(e || '').trim().toLowerCase()
}

/**
 * Build the canonical session user.
 * RULES (in priority order — earlier rules win):
 *  1. ADMIN role OR is_admin=1 OR email is in PERMANENT_ADMIN_EMAILS → ADMIN role forever
 *     (admins are NEVER downgraded, even if premium_until expires)
 *  2. membership_type column is the source of truth for billing (FREE/PREMIUM/VIP)
 *  3. premium_until controls when paid membership expires (NULL or future = active)
 *  4. role column is kept in sync but is just a denormalized view of the above
 */
export function buildSessionUser(u: User): SessionUser {
  const now = new Date()
  const email = normEmail(u.email)

  // Is admin? — multiple sources, ANY of them is sufficient
  const isAdmin =
    u.role === 'ADMIN' ||
    !!u.is_admin ||
    PERMANENT_ADMIN_EMAILS.includes(email)

  // membership_type comes from migration 0005; fall back to role
  let membership: 'FREE' | 'PREMIUM' | 'VIP' =
    (u.membership_type as any) ||
    (u.role === 'PREMIUM' ? 'PREMIUM' : u.role === 'VIP' ? 'VIP' : 'FREE')

  // Check premium_until: if expired, downgrade billing to FREE
  // (NULL premium_until = lifetime / never expires)
  if (u.premium_until && new Date(u.premium_until) <= now) {
    membership = 'FREE'
  }

  // Compute final role (denormalized — admins always win)
  let role: 'USER' | 'PREMIUM' | 'VIP' | 'ADMIN'
  if (isAdmin) role = 'ADMIN'
  else if (membership === 'VIP') role = 'VIP'
  else if (membership === 'PREMIUM') role = 'PREMIUM'
  else role = 'USER'

  return {
    id: u.id,
    email: u.email,
    username: u.username,
    avatar: u.avatar,
    role,
    membership: isAdmin ? 'VIP' : membership, // admins get VIP perks too
    isPremium: isAdmin || membership === 'PREMIUM' || membership === 'VIP',
    isVip: isAdmin || membership === 'VIP',
    isAdmin,
    premiumUntil: u.premium_until,
  }
}

/**
 * Auto-heal admin role in the database whenever a permanent admin email
 * shows up but the DB row says otherwise. Defense in depth — even if some
 * code accidentally sets role='USER' for shadow@gmail.com, the next request
 * snaps it back to ADMIN.
 */
async function ensureAdminRoleSynced(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  u: User
): Promise<User> {
  const email = normEmail(u.email)
  const isPermanentAdmin = PERMANENT_ADMIN_EMAILS.includes(email)
  // Also check admin_emails table if present
  let dbAdminEmail = false
  try {
    const row = await c.env.DB.prepare('SELECT email FROM admin_emails WHERE email = ?')
      .bind(email).first()
    dbAdminEmail = !!row
  } catch {
    /* table may not exist yet during migration */
  }
  const shouldBeAdmin = isPermanentAdmin || dbAdminEmail
  if (shouldBeAdmin && (u.role !== 'ADMIN' || !u.is_admin)) {
    await c.env.DB.prepare(
      `UPDATE users SET role = 'ADMIN', is_admin = 1,
       premium_until = COALESCE(premium_until, '2099-12-31T23:59:59Z'),
       banned = 0
       WHERE id = ?`
    ).bind(u.id).run()
    u.role = 'ADMIN'
    u.is_admin = 1
    if (!u.premium_until) u.premium_until = '2099-12-31T23:59:59Z'
    u.banned = 0
  }
  return u
}

export async function getUserFromRequest(
  c: Context<{ Bindings: Bindings; Variables: Variables }>
): Promise<SessionUser | null> {
  const token = getCookie(c, 'aniverse_token')
  if (!token) return null
  const payload = await verifyJWT<{ id: number }>(token, c.env.JWT_SECRET)
  if (!payload?.id) return null
  let u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(payload.id)
    .first<User>()
  if (!u || u.banned) return null
  // Auto-restore admin role for permanent admin emails (idempotent)
  u = await ensureAdminRoleSynced(c, u)
  const session = buildSessionUser(u)
  // attach active profile id from cookie
  const profileId = Number(getCookie(c, 'aniverse_profile') || 0)
  if (profileId) session.activeProfileId = profileId
  return session
}

export async function getActiveProfile(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: SessionUser
) {
  const profileId = user.activeProfileId
  if (profileId) {
    const p = await c.env.DB.prepare(
      'SELECT * FROM profiles WHERE id = ? AND user_id = ?'
    ).bind(profileId, user.id).first()
    if (p) return p as any
  }
  // fallback to main profile
  const main = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE user_id = ? ORDER BY is_main DESC, id ASC LIMIT 1'
  ).bind(user.id).first()
  return main as any
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const user = await getUserFromRequest(c)
  if (user) c.set('user', user)
  await next()
}

export const requireAuth: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.redirect('/login')
  }
  await next()
}

export const requireAdmin: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const user = c.get('user')
  if (!user || !user.isAdmin) {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    return c.redirect('/login')
  }
  await next()
}

// Detect if request is over HTTPS so we set Secure cookies only when supported.
// IMPORTANT: behind a TLS-terminating proxy (e.g. sandbox.novita.ai, Cloudflare),
// wrangler internally receives plain HTTP and the x-forwarded-proto header may be missing.
// On plain localhost HTTP, Secure cookies are silently dropped by browsers — so we must
// NOT mark them Secure there. Heuristic:
//   1. c.req.url scheme says https? -> secure
//   2. x-forwarded-proto contains "https"? -> secure
//   3. host is anything other than localhost / 127.0.0.1 (i.e. a public hostname)? -> secure
//      (browsers serve any non-loopback hostname via HTTPS on Cloudflare Pages / sandbox)
function isSecureRequest(c: Context): boolean {
  const url = c.req.url
  if (url.startsWith('https://')) return true
  const xfp = c.req.header('x-forwarded-proto')
  if (xfp && xfp.toLowerCase().includes('https')) return true
  const host = (c.req.header('host') || '').toLowerCase()
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1') && !host.startsWith('0.0.0.0')) {
    return true
  }
  return false
}

export function setAuthCookie(c: Context, token: string) {
  setCookie(c, 'aniverse_token', token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearAuthCookie(c: Context) {
  deleteCookie(c, 'aniverse_token', { path: '/', secure: isSecureRequest(c), sameSite: 'Lax' })
  // also clear profile cookie
  deleteCookie(c, 'aniverse_profile', { path: '/', secure: isSecureRequest(c), sameSite: 'Lax' })
}

// Exported for other routes that set cookies (profile selector)
export function cookieSecure(c: Context): boolean {
  return isSecureRequest(c)
}
