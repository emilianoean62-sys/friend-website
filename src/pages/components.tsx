// Shared reusable components
import type { SessionUser } from '../lib/types'

export function AnimeCard({
  anime,
  user,
  showProgress,
  progress,
}: {
  anime: any
  user?: SessionUser | null
  showProgress?: boolean
  progress?: { progress_seconds: number; total_seconds: number }
}) {
  const isPremiumContent = !!anime.is_premium || !!anime.is_vip
  const canAccess = !isPremiumContent || (user && (user.isPremium || user.isVip || user.isAdmin)) || (anime.is_vip && user?.isVip)
  const locked = isPremiumContent && !canAccess
  const href = `/anime/${anime.slug}`
  const newest = anime.created_at && (Date.now() - new Date(anime.created_at).getTime()) < 7 * 24 * 3600 * 1000

  const fallback = `https://placehold.co/400x600/13131c/ff7a18?text=${encodeURIComponent(anime.title || 'Anime').slice(0, 40)}`
  const posterUrl = anime.poster || fallback
  const card = (
    <div class={`anime-card ${locked ? 'locked' : ''}`}>
      <div class="poster" style={`background-image:url('${posterUrl}'), url('${fallback}')`}></div>
      {anime.is_vip ? (
        <div class="vip-badge"><i class="fa-solid fa-gem"></i>VIP</div>
      ) : anime.is_premium ? (
        <div class="premium-badge"><i class="fa-solid fa-crown"></i>Premium</div>
      ) : null}
      {newest && !anime.is_vip && !anime.is_premium && <div class="new-badge">New</div>}
      {locked && (
        <div class="lock-overlay">
          <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
          <div class="lock-label">{anime.is_vip ? 'VIP Only' : 'Premium Only'}</div>
        </div>
      )}
      {!locked && (
        <div class="play-overlay">
          <div class="play-btn"><i class="fa-solid fa-play text-black"></i></div>
        </div>
      )}
      <div class="info">
        <div class="title line-clamp-2">{anime.title}</div>
        <div class="meta flex items-center gap-2">
          {anime.release_year && <span>{anime.release_year}</span>}
          {anime.rating > 0 && (
            <span class="flex items-center gap-1"><i class="fa-solid fa-star text-av-gold"></i>{anime.rating}</span>
          )}
          <span class="uppercase">{anime.type || 'TV'}</span>
        </div>
      </div>
      {showProgress && progress && progress.total_seconds > 0 && (
        <div class="progress-bar">
          <div style={`width:${Math.min(100, (progress.progress_seconds / progress.total_seconds) * 100)}%`}></div>
        </div>
      )}
    </div>
  )

  if (locked) {
    return <a href="#" data-locked class="block">{card}</a>
  }
  return <a href={href} class="block">{card}</a>
}

export function CarouselSection({
  title,
  link,
  items,
  user,
  showProgress,
}: {
  title: string
  link?: string
  items: any[]
  user?: SessionUser | null
  showProgress?: boolean
}) {
  if (!items || items.length === 0) return null
  return (
    <section class="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 mt-2">
      <div class="section-title">
        <h2>{title}</h2>
        {link && <a href={link}>View all <i class="fa-solid fa-arrow-right text-xs ml-1"></i></a>}
      </div>
      <div class="carousel-wrap">
        <button class="carousel-arrow prev" aria-label="Scroll left"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="carousel">
          {items.map((a) => (
            <AnimeCard anime={a} user={user} showProgress={showProgress} progress={a._progress} />
          ))}
        </div>
        <button class="carousel-arrow next" aria-label="Scroll right"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </section>
  )
}
