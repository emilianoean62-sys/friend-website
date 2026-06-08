// AniVerse Chat — polling-based real-time
(function () {
  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const typingEl = document.getElementById('chat-typing');
  const onlineList = document.getElementById('online-list');
  const onlineCount = document.getElementById('online-count');
  const emojiPicker = document.getElementById('emoji-picker');
  const emojiBtn = document.getElementById('emoji-btn');
  const imageBtn = document.getElementById('image-btn');

  if (!messagesEl) return; // not on chat page or no access

  const channelSlug = messagesEl.dataset.channel;
  let lastId = 0;
  let lastTypingSent = 0;
  let myUserId = null;
  let myIsAdmin = false;
  const renderedIds = new Set();
  let loading = true;

  // --- Tiny fetch wrapper that ALWAYS sends cookies + JSON content type ---
  async function api(url, opts) {
    opts = opts || {};
    opts.credentials = opts.credentials || 'same-origin';
    opts.headers = Object.assign(
      { 'Accept': 'application/json' },
      opts.body ? { 'Content-Type': 'application/json' } : {},
      opts.headers || {}
    );
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function roleBadge(role) {
    if (role === 'ADMIN') return '<span class="role-badge admin"><i class="fa-solid fa-shield-halved"></i>ADMIN</span>';
    if (role === 'VIP') return '<span class="role-badge vip"><i class="fa-solid fa-gem"></i>VIP</span>';
    if (role === 'PREMIUM') return '<span class="role-badge premium"><i class="fa-solid fa-crown"></i>PREMIUM</span>';
    return '';
  }

  function avatarHtml(m) {
    const url = m.profile_avatar || m.avatar;
    const initials = (m.profile_name || m.username || '?').slice(0, 1).toUpperCase();
    const cls = m.role === 'VIP' ? 'role-vip' : m.role === 'PREMIUM' ? 'role-premium' : m.role === 'ADMIN' ? 'role-admin' : '';
    if (url) {
      return `<div class="chat-avatar ${cls}"><img src="${escapeHtml(url)}" alt="" onerror="this.parentNode.innerHTML='${initials}'"/></div>`;
    }
    return `<div class="chat-avatar ${cls}">${initials}</div>`;
  }

  function attachmentHtml(m) {
    if (!m.attachment_url) return '';
    if (m.attachment_type === 'image' || m.attachment_type === 'gif') {
      return `<a href="${escapeHtml(m.attachment_url)}" target="_blank" rel="noopener"><img src="${escapeHtml(m.attachment_url)}" class="chat-attachment" loading="lazy" onerror="this.style.display='none'"/></a>`;
    }
    return `<a href="${escapeHtml(m.attachment_url)}" target="_blank" rel="noopener" class="text-av-orange underline text-sm">${escapeHtml(m.attachment_url)}</a>`;
  }

  function reactionsHtml(m) {
    if (!m.reactions || m.reactions.length === 0) return '';
    return '<div class="chat-reactions">' + m.reactions.map(r => {
      const mine = myUserId && r.users && r.users.indexOf(myUserId) !== -1;
      return `<button class="chat-reaction ${mine ? 'mine' : ''}" data-react-toggle="${m.id}" data-emoji="${escapeHtml(r.emoji)}">${r.emoji} ${r.count}</button>`;
    }).join('') + '</div>';
  }

  function renderMessage(m) {
    if (renderedIds.has(m.id)) return null;
    renderedIds.add(m.id);
    const createdAt = m.created_at || '';
    const time = createdAt
      ? new Date(createdAt + (createdAt.endsWith('Z') ? '' : 'Z')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    const div = document.createElement('div');
    div.className = 'chat-msg' + (m.pinned ? ' is-pinned' : '') + (m.deleted ? ' is-deleted' : '');
    div.dataset.id = m.id;
    div.dataset.userId = m.user_id;
    const canDelete = m.user_id === myUserId || myIsAdmin;
    const displayName = m.profile_name || m.username;
    div.innerHTML = `
      ${avatarHtml(m)}
      <div class="chat-msg-body">
        <div class="chat-msg-head">
          <span class="chat-msg-name">${escapeHtml(displayName)}</span>
          ${roleBadge(m.role)}
          ${m.pinned ? '<i class="fa-solid fa-thumbtack text-av-orange text-xs" title="Pinned"></i>' : ''}
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-content">${m.deleted ? '<i class="text-av-muted">[deleted]</i>' : escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
        ${attachmentHtml(m)}
        ${reactionsHtml(m)}
        ${!m.deleted ? `
          <div class="chat-msg-actions">
            <button data-react="${m.id}" title="React"><i class="fa-regular fa-face-smile"></i></button>
            ${canDelete ? `<button data-del="${m.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
            ${myIsAdmin ? `<button data-pin="${m.id}" title="Pin"><i class="fa-solid fa-thumbtack"></i></button>` : ''}
            ${myIsAdmin && m.user_id !== myUserId ? `<button data-mute="${m.user_id}" title="Mute 10m"><i class="fa-solid fa-volume-xmark"></i></button>` : ''}
          </div>
        ` : ''}
      </div>
    `;
    return div;
  }

  function appendMessages(list) {
    const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
    const frag = document.createDocumentFragment();
    let any = false;
    list.forEach(m => {
      const el = renderMessage(m);
      if (el) { frag.appendChild(el); any = true; }
      if (m.id > lastId) lastId = m.id;
    });
    if (any) {
      if (loading) {
        const l = document.getElementById('chat-loading');
        if (l) l.remove();
        loading = false;
      }
      messagesEl.appendChild(frag);
      if (wasAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (loading && lastId === 0) {
      // First poll returned no messages — show empty state
      const l = document.getElementById('chat-loading');
      if (l) l.innerHTML = '<i class="fa-regular fa-comment-dots text-2xl mb-2 block"></i><div>No messages yet. Be the first to say hi!</div>';
    }
  }

  async function fetchMessages() {
    try {
      const r = await api(`/api/chat/channels/${encodeURIComponent(channelSlug)}/messages?after=${lastId}`);
      if (r.status === 401) {
        // session lost — kick back to login
        window.location.replace('/login?next=' + encodeURIComponent(location.pathname));
        return;
      }
      if (!r.ok) {
        if (loading) {
          const l = document.getElementById('chat-loading');
          if (l) {
            const d = await r.json().catch(() => ({}));
            l.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-400 text-2xl mb-2 block"></i><div>${d.error || 'Failed to load chat'}</div>`;
          }
        }
        return;
      }
      const d = await r.json();
      if (d.messages && d.messages.length) appendMessages(d.messages);
      else if (loading) appendMessages([]);
    } catch (e) {
      // network error — keep silent, will retry on next poll
    }
  }

  async function fetchOnline() {
    if (!onlineList || !onlineCount) return;
    try {
      const r = await api(`/api/chat/channels/${encodeURIComponent(channelSlug)}/online`);
      if (!r.ok) return;
      const d = await r.json();
      const list = d.online || [];
      onlineCount.textContent = list.length;
      onlineList.innerHTML = list.map(u => {
        const cls = u.role === 'VIP' ? 'role-vip' : u.role === 'PREMIUM' ? 'role-premium' : u.role === 'ADMIN' ? 'role-admin' : '';
        const avatar = u.avatar
          ? `<img src="${escapeHtml(u.avatar)}" onerror="this.style.display='none'"/>`
          : escapeHtml((u.username || '?')[0].toUpperCase());
        return `<div class="online-row ${u.typing ? 'is-typing' : ''}">
          <div class="online-avatar ${cls}">${avatar}<span class="online-dot"></span></div>
          <div class="flex-1 min-w-0">
            <div class="text-sm truncate">${escapeHtml(u.username)}</div>
            ${u.typing ? '<div class="text-[10px] text-av-orange">typing…</div>' : '<div class="text-[10px] text-av-muted uppercase">' + escapeHtml(u.role || 'USER') + '</div>'}
          </div>
        </div>`;
      }).join('');

      if (typingEl) {
        const typers = list.filter(u => u.typing && u.id !== myUserId);
        if (typers.length === 0) typingEl.textContent = '';
        else if (typers.length === 1) typingEl.innerHTML = `<i class="fa-solid fa-circle-dot text-av-orange typing-pulse"></i> <b>${escapeHtml(typers[0].username)}</b> is typing…`;
        else typingEl.innerHTML = `<i class="fa-solid fa-circle-dot text-av-orange typing-pulse"></i> ${typers.length} people are typing…`;
      }
    } catch (e) {}
  }

  async function heartbeat() {
    try {
      await api('/api/chat/heartbeat', { method: 'POST', body: { channel_slug: channelSlug } });
    } catch (e) {}
  }

  async function bootstrap() {
    // Pull /api/auth/me first to know our user id
    try {
      const r = await api('/api/auth/me');
      if (r.ok) {
        const d = await r.json();
        if (d && d.user) {
          myUserId = d.user.id;
          myIsAdmin = !!d.user.isAdmin;
        } else {
          // not logged in — kick to login (chat requires auth)
          window.location.replace('/login?next=' + encodeURIComponent(location.pathname));
          return;
        }
      }
    } catch (e) {}
    await heartbeat();
    await fetchMessages();
    await fetchOnline();
  }

  // Send message
  if (form && input) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = input.value.trim();
      if (!content) return;
      input.disabled = true;
      try {
        const r = await api(`/api/chat/channels/${encodeURIComponent(channelSlug)}/messages`, {
          method: 'POST',
          body: { content },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          (window.toast || alert)(d.error || 'Failed to send', 'error');
        } else {
          input.value = '';
          fetchMessages();
        }
      } catch (err) {
        (window.toast || alert)('Network error — try again', 'error');
      } finally {
        input.disabled = false;
        input.focus();
      }
    });

    // Typing indicator (throttled)
    input.addEventListener('input', () => {
      const now = Date.now();
      if (now - lastTypingSent > 3000) {
        lastTypingSent = now;
        api(`/api/chat/channels/${encodeURIComponent(channelSlug)}/typing`, { method: 'POST' }).catch(() => {});
      }
    });
  }

  // Message actions (event delegation)
  messagesEl.addEventListener('click', async (e) => {
    const reactBtn = e.target.closest('[data-react]');
    if (reactBtn && emojiPicker) {
      const id = reactBtn.dataset.react;
      emojiPicker.classList.remove('hidden');
      emojiPicker.dataset.target = id;
      emojiPicker.dataset.mode = 'react';
      const rect = reactBtn.getBoundingClientRect();
      emojiPicker.style.top = (rect.top - 200) + 'px';
      emojiPicker.style.left = Math.max(10, rect.left - 100) + 'px';
      return;
    }
    const toggleBtn = e.target.closest('[data-react-toggle]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.reactToggle;
      const emoji = toggleBtn.dataset.emoji;
      await api(`/api/chat/messages/${id}/react`, { method: 'POST', body: { emoji } });
      renderedIds.clear();
      messagesEl.innerHTML = '';
      lastId = 0;
      fetchMessages();
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      if (!confirm('Delete this message?')) return;
      const id = delBtn.dataset.del;
      await api(`/api/chat/messages/${id}`, { method: 'DELETE' });
      const el = messagesEl.querySelector(`[data-id="${id}"]`);
      if (el) {
        renderedIds.delete(Number(id));
        el.remove();
      }
      return;
    }
    const pinBtn = e.target.closest('[data-pin]');
    if (pinBtn) {
      await api(`/api/chat/messages/${pinBtn.dataset.pin}/pin`, { method: 'POST' });
      (window.toast || alert)('Pinned/unpinned', 'success');
      return;
    }
    const muteBtn = e.target.closest('[data-mute]');
    if (muteBtn) {
      const userId = Number(muteBtn.dataset.mute);
      const mins = prompt('Mute for how many minutes?', '10');
      if (!mins) return;
      await api('/api/chat/admin/mute', { method: 'POST', body: { user_id: userId, minutes: Number(mins) } });
      (window.toast || alert)('User muted for ' + mins + ' minutes', 'success');
      return;
    }
  });

  // Emoji picker
  if (emojiBtn && emojiPicker) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
      emojiPicker.dataset.mode = 'insert';
      const rect = emojiBtn.getBoundingClientRect();
      emojiPicker.style.top = (rect.top - 220) + 'px';
      emojiPicker.style.left = rect.left + 'px';
    });
  }
  if (emojiPicker) {
    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn && !e.target.closest('[data-react]')) {
        emojiPicker.classList.add('hidden');
      }
    });
    emojiPicker.addEventListener('click', async (e) => {
      const tile = e.target.closest('[data-emoji]');
      if (!tile) return;
      const emoji = tile.dataset.emoji;
      const mode = emojiPicker.dataset.mode;
      if (mode === 'react' && emojiPicker.dataset.target) {
        await api(`/api/chat/messages/${emojiPicker.dataset.target}/react`, { method: 'POST', body: { emoji } });
        renderedIds.clear();
        messagesEl.innerHTML = '';
        lastId = 0;
        fetchMessages();
      } else if (input) {
        input.value += emoji;
        input.focus();
      }
      emojiPicker.classList.add('hidden');
    });
  }

  // Image URL paste
  if (imageBtn) {
    imageBtn.addEventListener('click', async () => {
      const url = prompt('Paste image or GIF URL:');
      if (!url) return;
      const isGif = /\.gif(\?|$)/i.test(url);
      try {
        const r = await api(`/api/chat/channels/${encodeURIComponent(channelSlug)}/messages`, {
          method: 'POST',
          body: {
            content: (input && input.value.trim()) || '',
            attachment_url: url,
            attachment_type: isGif ? 'gif' : 'image',
          },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { (window.toast || alert)(d.error || 'Failed', 'error'); return; }
        if (input) input.value = '';
        fetchMessages();
      } catch (e) { (window.toast || alert)('Network error', 'error'); }
    });
  }

  // Mobile toggles
  document.querySelectorAll('[data-toggle-sidebar]').forEach(b => {
    b.addEventListener('click', () => {
      const el = document.querySelector('.chat-sidebar');
      if (el) el.classList.toggle('open');
    });
  });
  document.querySelectorAll('[data-toggle-online]').forEach(b => {
    b.addEventListener('click', () => {
      const el = document.querySelector('.chat-online');
      if (el) el.classList.toggle('open');
    });
  });

  bootstrap();
  // Polling
  setInterval(fetchMessages, 2000);
  setInterval(fetchOnline, 5000);
  setInterval(heartbeat, 30000);
})();
