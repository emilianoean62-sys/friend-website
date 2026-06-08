// Cloudflare bindings
export type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  APP_NAME: string
}

export type User = {
  id: number
  email: string
  username: string
  password_hash: string
  avatar: string
  role: 'USER' | 'PREMIUM' | 'VIP' | 'ADMIN'
  premium_until: string | null
  banned: number
  created_at: string
  // V2 columns (migration 0005)
  is_admin?: number
  membership_type?: 'FREE' | 'PREMIUM' | 'VIP'
}

export type SessionUser = {
  id: number
  email: string
  username: string
  avatar: string
  role: 'USER' | 'PREMIUM' | 'VIP' | 'ADMIN'
  membership: 'FREE' | 'PREMIUM' | 'VIP'
  isPremium: boolean
  isVip: boolean
  isAdmin: boolean
  premiumUntil: string | null
  activeProfileId?: number
}

export type Profile = {
  id: number
  user_id: number
  name: string
  avatar: string
  banner: string
  bio: string
  is_kids: number
  theme: string
  pin: string
  is_main: number
  created_at: string
}

export type Variables = {
  user?: SessionUser
  profile?: Profile
}
