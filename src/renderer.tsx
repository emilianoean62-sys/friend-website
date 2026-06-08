import { jsxRenderer } from 'hono/jsx-renderer'
import type { SessionUser } from './lib/types'

type Props = {
  title?: string
  user?: SessionUser | null
  hideNav?: boolean
  description?: string
}

export const renderer = jsxRenderer(({ children, title, user, hideNav, description }: any) => {
  const pageTitle = title ? `${title} • AniVerse` : 'AniVerse — Stream Anime in Cinematic Quality'
  const desc = description || 'AniVerse — Watch the best anime in cinematic 4K quality. Premium membership unlocks exclusive series, early episodes, and ad-free streaming.'
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5" />
        <title>{pageTitle}</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={desc} />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content="#0a0a0f" />
        <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
        <script src="https://cdn.tailwindcss.com"></script>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"
          rel="stylesheet"
        />
        <link href="/static/style.css" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    'av-bg':    '#07070b',
                    'av-bg-2':  '#0d0d14',
                    'av-card':  '#13131c',
                    'av-line':  '#1f1f2e',
                    'av-text':  '#e9e9f3',
                    'av-muted': '#8a8a9c',
                    'av-orange':'#ff7a18',
                    'av-orange-2':'#ff9a3c',
                    'av-gold': '#ffc857',
                    'av-vip':  '#b88aff',
                  },
                  fontFamily: {
                    sans: ['Inter', 'system-ui', 'sans-serif'],
                    display: ['"Bebas Neue"', 'Inter', 'sans-serif'],
                  },
                  boxShadow: {
                    'av-glow': '0 0 60px -10px rgba(255,122,24,0.55)',
                    'av-glow-soft': '0 0 30px -8px rgba(255,122,24,0.35)',
                  }
                }
              }
            }
          `,
          }}
        />
      </head>
      <body class="bg-av-bg text-av-text font-sans antialiased min-h-screen overflow-x-hidden">
        <div class="bg-particles" aria-hidden="true">
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
        </div>
        {!hideNav && <Navbar user={user} />}
        <main class="min-h-screen">{children}</main>
        {!hideNav && <Footer />}
        <PremiumModal />
        <ToastContainer />
        <script src="/static/app.js" defer></script>
      </body>
    </html>
  )
})

function Navbar({ user }: { user?: SessionUser | null }) {
  return (
    <header id="av-nav" class="fixed top-0 inset-x-0 z-50 transition-all duration-300">
      <div class="av-nav-bg absolute inset-0 pointer-events-none"></div>
      <nav class="relative max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 h-16 sm:h-20 flex items-center justify-between gap-4">
        <div class="flex items-center gap-6 sm:gap-10">
          <a href="/" class="flex items-center gap-2 group">
            <div class="relative w-9 h-9 rounded-xl bg-gradient-to-br from-av-orange to-av-orange-2 flex items-center justify-center shadow-av-glow-soft group-hover:scale-105 transition-transform">
              <i class="fa-solid fa-play text-white text-sm ml-0.5"></i>
            </div>
            <span class="font-display tracking-wider text-2xl sm:text-3xl">
              ANI<span class="text-av-orange">VERSE</span>
            </span>
          </a>
          <div class="hidden md:flex items-center gap-1 text-sm">
            <a href="/" class="av-nav-link">Home</a>
            <a href="/browse" class="av-nav-link">Browse</a>
            <a href="/trending" class="av-nav-link">Trending</a>
            <a href="/membership" class="av-nav-link relative">
              <span>Premium</span>
              <span class="ml-1 text-[10px] uppercase font-bold text-av-orange">Hot</span>
            </a>
          </div>
        </div>

        <div class="flex-1 max-w-md hidden sm:block">
          <form action="/search" method="GET" class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-av-muted text-sm"></i>
            <input
              name="q"
              type="text"
              placeholder="Search anime, genres, studios…"
              class="w-full bg-av-card/70 backdrop-blur-md border border-av-line rounded-full pl-11 pr-4 py-2.5 text-sm placeholder:text-av-muted focus:outline-none focus:border-av-orange focus:ring-2 focus:ring-av-orange/20 transition-all"
            />
          </form>
        </div>

        <div class="flex items-center gap-1 sm:gap-2">
          <a href="/search" class="sm:hidden av-nav-icon"><i class="fa-solid fa-magnifying-glass"></i></a>
          {user && (
            <>
              <a href="/chat" class="av-nav-icon relative" title="Community Chat">
                <i class="fa-solid fa-comments"></i>
              </a>
              <a href="/friends" class="av-nav-icon hidden sm:inline-flex" title="Friends">
                <i class="fa-solid fa-user-group"></i>
              </a>
              <NavNotifications />
            </>
          )}
          {user ? <NavUserMenu user={user} /> : <NavGuest />}
        </div>
      </nav>

      {/* mobile bottom bar */}
      <div class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-av-bg-2/95 backdrop-blur-xl border-t border-av-line">
        <div class="grid grid-cols-5 text-[10px] uppercase tracking-wider text-av-muted">
          <a href="/" class="flex flex-col items-center py-2.5 gap-1 hover:text-av-orange transition">
            <i class="fa-solid fa-house text-base"></i>Home
          </a>
          <a href="/browse" class="flex flex-col items-center py-2.5 gap-1 hover:text-av-orange transition">
            <i class="fa-solid fa-compass text-base"></i>Browse
          </a>
          <a href="/search" class="flex flex-col items-center py-2.5 gap-1 hover:text-av-orange transition">
            <i class="fa-solid fa-magnifying-glass text-base"></i>Search
          </a>
          <a href="/membership" class="flex flex-col items-center py-2.5 gap-1 hover:text-av-orange transition">
            <i class="fa-solid fa-crown text-base text-av-orange"></i>Premium
          </a>
          <a href={user ? '/profile' : '/login'} class="flex flex-col items-center py-2.5 gap-1 hover:text-av-orange transition">
            <i class="fa-solid fa-user text-base"></i>{user ? 'Me' : 'Login'}
          </a>
        </div>
      </div>
    </header>
  )
}

function NavNotifications() {
  return (
    <div class="relative" data-notif>
      <button class="av-nav-icon relative" data-notif-trigger aria-label="Notifications">
        <i class="fa-solid fa-bell"></i>
        <span class="notif-dot hidden" data-notif-dot></span>
      </button>
      <div class="notif-panel" data-notif-panel>
        <div class="flex items-center justify-between px-4 py-3 border-b border-av-line">
          <div class="font-semibold">Notifications</div>
          <button data-notif-read-all class="text-xs text-av-orange hover:underline">Mark all read</button>
        </div>
        <div data-notif-list>
          <div class="text-center py-10 text-av-muted text-sm">No notifications yet</div>
        </div>
      </div>
    </div>
  )
}

function NavGuest() {
  return (
    <div class="flex items-center gap-2">
      <a href="/login" class="px-4 py-2 text-sm font-semibold hover:text-av-orange transition">Sign in</a>
      <a
        href="/register"
        class="px-4 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-av-orange to-av-orange-2 text-black hover:shadow-av-glow transition-all"
      >
        Get Started
      </a>
    </div>
  )
}

function NavUserMenu({ user }: { user: SessionUser }) {
  const initials = (user.username || user.email).slice(0, 2).toUpperCase()
  return (
    <div class="relative" data-dropdown>
      <button class="flex items-center gap-2 group" data-dropdown-trigger aria-label="User menu">
        {user.isPremium && (
          <span class="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-av-orange/15 text-av-orange border border-av-orange/30">
            <i class="fa-solid fa-crown text-[10px]"></i> {user.isVip ? 'VIP' : 'Premium'}
          </span>
        )}
        <div class={`w-10 h-10 rounded-full grid place-items-center text-sm font-bold border-2 ${
          user.isVip ? 'border-av-vip shadow-[0_0_18px_-2px_rgba(184,138,255,0.6)]' :
          user.isPremium ? 'border-av-orange shadow-av-glow-soft' :
          'border-av-line'
        } bg-av-card group-hover:scale-105 transition`}>
          {user.avatar ? <img src={user.avatar} alt="" class="w-full h-full rounded-full object-cover" /> : initials}
        </div>
      </button>
      <div
        data-dropdown-menu
        class="absolute right-0 mt-2 w-64 origin-top-right opacity-0 scale-95 pointer-events-none transition-all duration-200 bg-av-card/95 backdrop-blur-xl rounded-2xl border border-av-line shadow-2xl overflow-hidden"
      >
        <div class="p-4 border-b border-av-line">
          <div class="font-semibold">{user.username}</div>
          <div class="text-xs text-av-muted truncate">{user.email}</div>
          <div class="mt-2 text-[10px] uppercase tracking-wider font-bold">
            {user.isAdmin && <span class="text-red-400">Administrator</span>}
            {!user.isAdmin && user.isVip && <span class="text-av-vip">VIP Member</span>}
            {!user.isAdmin && !user.isVip && user.isPremium && <span class="text-av-orange">Premium Member</span>}
            {!user.isAdmin && !user.isPremium && <span class="text-av-muted">Free Member</span>}
          </div>
        </div>
        <div class="py-2 text-sm">
          <a href="/profiles" class="av-menu-item"><i class="fa-solid fa-users w-5"></i>Switch Profile</a>
          <a href="/profile" class="av-menu-item"><i class="fa-solid fa-user w-5"></i>Account</a>
          <a href="/friends" class="av-menu-item"><i class="fa-solid fa-user-group w-5"></i>Friends</a>
          <a href="/chat" class="av-menu-item"><i class="fa-solid fa-comments w-5"></i>Community Chat</a>
          {!user.isPremium && (
            <a href="/membership" class="av-menu-item text-av-orange"><i class="fa-solid fa-crown w-5"></i>Upgrade to Premium</a>
          )}
          {user.isAdmin && (
            <>
              <a href="/admin" class="av-menu-item text-red-400"><i class="fa-solid fa-shield-halved w-5"></i>Admin Panel</a>
              <a href="/admin/chat" class="av-menu-item text-red-400"><i class="fa-solid fa-gavel w-5"></i>Chat Moderation</a>
            </>
          )}
          <button type="button" data-logout class="av-menu-item w-full text-left text-red-400">
            <i class="fa-solid fa-right-from-bracket w-5"></i>Logout
          </button>
        </div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer class="relative mt-24 border-t border-av-line bg-av-bg-2 pb-24 md:pb-12">
      <div class="max-w-[1500px] mx-auto px-6 lg:px-10 py-14 grid grid-cols-2 sm:grid-cols-4 gap-10 text-sm">
        <div class="col-span-2">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-av-orange to-av-orange-2 grid place-items-center">
              <i class="fa-solid fa-play text-white text-sm ml-0.5"></i>
            </div>
            <span class="font-display tracking-wider text-2xl">ANI<span class="text-av-orange">VERSE</span></span>
          </div>
          <p class="text-av-muted max-w-md">
            Stream thousands of anime series and movies in cinematic 4K. Join AniVerse Premium for early access,
            ad-free playback, and exclusive VIP titles.
          </p>
        </div>
        <div>
          <div class="font-semibold mb-3">Explore</div>
          <ul class="space-y-2 text-av-muted">
            <li><a href="/browse" class="hover:text-av-orange">Browse</a></li>
            <li><a href="/trending" class="hover:text-av-orange">Trending</a></li>
            <li><a href="/search" class="hover:text-av-orange">Search</a></li>
            <li><a href="/membership" class="hover:text-av-orange">Premium</a></li>
          </ul>
        </div>
        <div>
          <div class="font-semibold mb-3">Account</div>
          <ul class="space-y-2 text-av-muted">
            <li><a href="/login" class="hover:text-av-orange">Login</a></li>
            <li><a href="/register" class="hover:text-av-orange">Register</a></li>
            <li><a href="/profile" class="hover:text-av-orange">Profile</a></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-av-line py-5 text-center text-xs text-av-muted">
        © {new Date().getFullYear()} AniVerse. Built with ⚡ on Cloudflare Edge.
      </div>
    </footer>
  )
}

function PremiumModal() {
  return (
    <div id="premium-modal" class="fixed inset-0 z-[100] hidden items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-md" data-close-modal></div>
      <div class="relative w-full max-w-2xl bg-gradient-to-br from-av-card to-av-bg-2 rounded-3xl border border-av-orange/30 shadow-av-glow overflow-hidden animate-modal-in">
        <div class="absolute -top-32 -right-32 w-72 h-72 rounded-full bg-av-orange/20 blur-3xl"></div>
        <div class="absolute -bottom-32 -left-32 w-72 h-72 rounded-full bg-av-vip/20 blur-3xl"></div>
        <button class="absolute top-4 right-4 w-9 h-9 rounded-full bg-av-bg/80 hover:bg-av-bg grid place-items-center z-10" data-close-modal>
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="relative p-8 sm:p-10">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-av-orange/15 text-av-orange text-xs font-bold uppercase tracking-wider mb-4">
            <i class="fa-solid fa-crown"></i> Premium Required
          </div>
          <h2 class="text-3xl sm:text-4xl font-display tracking-wide mb-3">Unlock the Full AniVerse</h2>
          <p class="text-av-muted mb-6">This content is exclusive to Premium and VIP members. Upgrade to unlock thousands of anime, 4K streaming, and early releases.</p>
          <ul class="space-y-3 mb-7 text-sm">
            <li class="flex items-center gap-3"><i class="fa-solid fa-circle-check text-av-orange"></i>Unlock all anime and episodes</li>
            <li class="flex items-center gap-3"><i class="fa-solid fa-circle-check text-av-orange"></i>4K streaming, no ads, downloads</li>
            <li class="flex items-center gap-3"><i class="fa-solid fa-circle-check text-av-orange"></i>Early access — episodes before everyone</li>
            <li class="flex items-center gap-3"><i class="fa-solid fa-circle-check text-av-orange"></i>VIP-only exclusive series</li>
          </ul>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="/membership" class="flex-1 text-center py-3 rounded-full bg-gradient-to-r from-av-orange to-av-orange-2 text-black font-bold hover:shadow-av-glow transition">
              <i class="fa-solid fa-crown mr-2"></i>Upgrade Now
            </a>
            <button data-close-modal class="px-6 py-3 rounded-full bg-av-card border border-av-line hover:border-av-orange/50 transition">
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToastContainer() {
  return <div id="toast-container" class="fixed top-24 right-4 z-[200] flex flex-col gap-2 pointer-events-none"></div>
}
