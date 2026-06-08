// =====================================================
//  AniVerse — Client-side JS (vanilla, no framework)
// =====================================================
(function () {
  'use strict';

  // ---------- Navbar scroll effect ----------
  const nav = document.getElementById('av-nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 30) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Dropdown menus ----------
  document.querySelectorAll('[data-dropdown]').forEach((dd) => {
    const trigger = dd.querySelector('[data-dropdown-trigger]');
    if (!trigger) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('[data-dropdown].open').forEach((o) => {
        if (o !== dd) o.classList.remove('open');
      });
      dd.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('[data-dropdown].open').forEach((o) => o.classList.remove('open'));
  });

  // ---------- Premium modal ----------
  const modal = document.getElementById('premium-modal');
  window.openPremiumModal = function () {
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  window.closePremiumModal = function () {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };
  document.querySelectorAll('[data-close-modal]').forEach((b) => {
    b.addEventListener('click', window.closePremiumModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closePremiumModal();
  });

  // ---------- Locked content click handler ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-locked]');
    if (el) {
      e.preventDefault();
      e.stopPropagation();
      window.openPremiumModal();
    }
  });

  // ---------- Toast ----------
  window.toast = function (msg, type = 'info', duration = 3500) {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check text-emerald-400' :
                 type === 'error'   ? 'fa-circle-exclamation text-red-400' :
                                      'fa-circle-info text-av-orange';
    t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${msg}</span>`;
    cont.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, duration);
  };

  // ---------- Hero slider ----------
  const slider = document.querySelector('.hero-slider');
  if (slider) {
    const slides = slider.querySelectorAll('.hero-slide');
    const dotsContainer = slider.querySelector('.hero-dots');
    let current = 0;
    let interval = null;

    if (dotsContainer && slides.length > 1) {
      slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `Slide ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
      });
    }

    const dots = () => slider.querySelectorAll('.hero-dot');

    function goTo(i) {
      slides[current].classList.remove('active');
      dots()[current]?.classList.remove('active');
      current = (i + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots()[current]?.classList.add('active');
    }
    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    slider.querySelector('.hero-nav.next')?.addEventListener('click', next);
    slider.querySelector('.hero-nav.prev')?.addEventListener('click', prev);

    function start() { if (interval) clearInterval(interval); interval = setInterval(next, 6000); }
    function stop() { if (interval) clearInterval(interval); }
    start();
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
  }

  // ---------- Carousels (arrows) ----------
  document.querySelectorAll('.carousel-wrap').forEach((wrap) => {
    const carousel = wrap.querySelector('.carousel');
    if (!carousel) return;
    wrap.querySelector('.carousel-arrow.prev')?.addEventListener('click', () => {
      carousel.scrollBy({ left: -carousel.clientWidth * 0.8, behavior: 'smooth' });
    });
    wrap.querySelector('.carousel-arrow.next')?.addEventListener('click', () => {
      carousel.scrollBy({ left: carousel.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  // ---------- Tilt card effect ----------
  document.querySelectorAll('.tilt-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(0)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });

  // ---------- Fade-in on scroll ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in-up').forEach((el) => io.observe(el));

  // ---------- Generic AJAX helper ----------
  window.api = async function (url, opts = {}) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    // Always include cookies — critical for auth to persist after login
    opts.credentials = opts.credentials || 'same-origin';
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  };

  // ---------- Favorite toggle ----------
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-fav-toggle]');
    if (!btn) return;
    e.preventDefault();
    const animeId = btn.dataset.animeId;
    try {
      const r = await window.api('/api/favorites/toggle', { method: 'POST', body: { anime_id: animeId } });
      btn.classList.toggle('active', r.favorited);
      const icon = btn.querySelector('i');
      if (icon) icon.className = r.favorited ? 'fa-solid fa-heart text-red-500' : 'fa-regular fa-heart';
      window.toast(r.favorited ? 'Added to favorites' : 'Removed from favorites', 'success', 2000);
    } catch (err) {
      if (err.message === 'Unauthorized') {
        window.toast('Please login first', 'error');
        setTimeout(() => location.href = '/login', 800);
      } else window.toast(err.message, 'error');
    }
  });

  // ---------- Login / Register form submit ----------
  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const orig = btn?.innerHTML;
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Please wait…'; }
      const data = Object.fromEntries(new FormData(form));
      try {
        const out = await window.api(form.action, { method: 'POST', body: data });
        // VERIFY the cookie actually landed before redirecting — fixes "logs in then logged out" bug
        const verify = await fetch('/api/auth/me', { credentials: 'same-origin' });
        const me = await verify.json();
        if (!me.user) {
          throw new Error('Session not saved. Please enable cookies for this site and try again.');
        }
        window.toast('Welcome ' + (me.user.username || '') + '!', 'success');
        // Use location.replace so the back button doesn't return to the login form
        setTimeout(() => location.replace(form.dataset.redirect || '/'), 400);
      } catch (err) {
        window.toast(err.message || 'Something went wrong', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      }
    });
  });

  // ---------- Comment form ----------
  document.querySelectorAll('[data-comment-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      try {
        const r = await window.api(form.action, { method: 'POST', body: data });
        window.toast('Comment posted', 'success');
        location.reload();
      } catch (err) {
        if (err.message === 'Unauthorized') { window.toast('Please login', 'error'); setTimeout(() => location.href = '/login', 700); }
        else window.toast(err.message, 'error');
      }
    });
  });

  // ---------- Logout handler (data-logout buttons) ----------
  // Uses fetch + cookie clear + hard reload to guarantee the session is gone.
  // Plain form-POST also works because the API redirects to "/" — but going through
  // fetch lets us confirm cookies were cleared and surface errors clearly.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-logout]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logging out…';
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
      });
    } catch (err) {
      /* even on network error, try to navigate away */
    }
    // Force a fresh load (no cache) so the navbar re-renders as logged-out
    window.location.replace('/?logged_out=1');
  });

  // ---------- Page loader ----------
  window.addEventListener('load', () => {
    const loader = document.getElementById('page-loader');
    if (loader) setTimeout(() => loader.classList.add('hidden'), 200);
    // Show "logged out" toast and clean URL
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('logged_out') === '1') {
        window.toast && window.toast('You have been logged out', 'success', 3000);
        params.delete('logged_out');
        const q = params.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      }
    } catch (e) {}
  });
})();

// =====================================================
// V2: Notifications dropdown
// =====================================================
(function () {
  const root = document.querySelector('[data-notif]');
  if (!root) return;
  const trigger = root.querySelector('[data-notif-trigger]');
  const panel = root.querySelector('[data-notif-panel]');
  const list = root.querySelector('[data-notif-list]');
  const dot = root.querySelector('[data-notif-dot]');
  const readAll = root.querySelector('[data-notif-read-all]');
  let loaded = false;

  function render(items, unread) {
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="text-center py-10 text-av-muted text-sm">No notifications yet</div>';
      return;
    }
    list.innerHTML = items.map(function (n) {
      const time = new Date(n.created_at + (n.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString();
      return '<a href="' + (n.link || '#') + '" data-notif-id="' + n.id + '" class="notif-row ' + (n.read ? '' : 'unread') + '">' +
        '<i class="fa-solid fa-bell text-av-orange mt-1"></i>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="text-sm font-semibold">' + (n.title || '') + '</div>' +
          '<div class="text-xs text-av-muted">' + (n.message || '') + '</div>' +
          '<div class="text-[10px] text-av-muted mt-1">' + time + '</div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  async function refresh() {
    try {
      const r = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json();
      if (dot) {
        if (d.unread > 0) dot.classList.remove('hidden');
        else dot.classList.add('hidden');
      }
      render(d.notifications, d.unread);
      loaded = true;
    } catch (e) {}
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
    if (!loaded) refresh();
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) panel.classList.remove('open');
  });
  if (readAll) {
    readAll.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'same-origin' });
      refresh();
    });
  }
  // Initial load + poll
  refresh();
  setInterval(refresh, 30000);
})();
