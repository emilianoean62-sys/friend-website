import { Hono } from 'hono'
import type { Bindings, Variables } from '../lib/types'
import { requireAuth } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Mock checkout — in production this would be Stripe Checkout Session creation
// For demo purposes we instantly upgrade the user. Replace with real Stripe logic
// using stripe.checkout.sessions.create() and webhook handler.
app.post('/checkout', requireAuth, async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null) as any
  const plan = String(body?.plan || '').toUpperCase()
  if (!['PREMIUM', 'VIP'].includes(plan)) return c.json({ error: 'Invalid plan' }, 400)

  const prices: Record<string, { amount: number; days: number }> = {
    PREMIUM: { amount: 9.99, days: 30 },
    VIP: { amount: 19.99, days: 30 },
  }
  const price = prices[plan]
  const newPremiumUntil = new Date(Date.now() + price.days * 24 * 3600 * 1000).toISOString()

  // Admins cannot "downgrade" via checkout — only sync premium_until forward if longer
  await c.env.DB.prepare(
    `UPDATE users SET
       role = CASE WHEN role = 'ADMIN' THEN 'ADMIN' ELSE ? END,
       membership_type = ?,
       premium_until = CASE
         WHEN premium_until IS NOT NULL AND premium_until > ? THEN premium_until
         ELSE ?
       END
     WHERE id = ?`
  ).bind(plan, plan, newPremiumUntil, newPremiumUntil, user.id).run()

  await c.env.DB.prepare(
    'INSERT INTO payments (user_id, plan, amount, status, duration_days) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.id, plan, price.amount, 'COMPLETED', price.days).run()

  return c.json({ ok: true, plan, premium_until: newPremiumUntil })
})

export default app
