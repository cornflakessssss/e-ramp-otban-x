(() => {
  'use strict';

  /*
   * E-RAMP OTBAN X — Admin Login Notifications
   * - Every authenticated session records one login event through a secure RPC.
   * - Only an account whose profile role is "admin" can read the login events.
   * - The admin sees a bell, unread count, recent login data, and an in-app toast.
   * - No IP address is collected. Only name, email, role, login time, and device/browser summary.
   */

  const CONFIG = Object.freeze({
    projectRef: 'mcdkanzilgnvnuemyljx',
    supabaseUrl: 'https://mcdkanzilgnvnuemyljx.supabase.co',
    publishableKey: 'sb_publishable_iFuPg4BHXoZkaErAEdrlsQ_a0swTiq8',
    pollIntervalMs: 20000,
    sessionCheckMs: 2000,
    maxRows: 50
  });

  const ids = Object.freeze({
    wrap: 'erampLoginNotificationWrap',
    button: 'erampLoginNotificationButton',
    badge: 'erampLoginNotificationBadge',
    panel: 'erampLoginNotificationPanel',
    list: 'erampLoginNotificationList',
    markRead: 'erampLoginMarkRead',
    refresh: 'erampLoginRefresh'
  });

  let activeAccessToken = '';
  let activeUserId = '';
  let currentProfile = null;
  let pollTimer = null;
  let sessionTimer = null;
  let latestKnownId = null;
  let initialLoadComplete = false;
  let isLoading = false;

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function parseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function findSession(value) {
    if (!value || typeof value !== 'object') return null;
    if (typeof value.access_token === 'string' && value.user?.id) return value;

    const candidates = [
      value.session,
      value.currentSession,
      value.data?.session,
      value.data,
      value
    ];

    return candidates.find((candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.access_token === 'string' &&
      candidate.user?.id
    ) || null;
  }

  function getStoredSession() {
    const exactKey = `sb-${CONFIG.projectRef}-auth-token`;
    const exactValue = localStorage.getItem(exactKey);
    const exactSession = findSession(parseJson(exactValue));
    if (exactSession) return exactSession;

    // Fallback if the authentication storage key was customised.
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('sb-') || !key.includes('auth-token')) continue;
      const candidate = findSession(parseJson(localStorage.getItem(key)));
      if (candidate?.user?.id) return candidate;
    }
    return null;
  }

  function decodeJwtPayload(token) {
    try {
      const part = token.split('.')[1];
      if (!part) return {};
      const normalised = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=');
      return JSON.parse(atob(padded));
    } catch {
      return {};
    }
  }

  function sessionIdentifier(session) {
    const payload = decodeJwtPayload(session.access_token);
    return String(
      payload.session_id ||
      payload.jti ||
      `${session.user.id}:${session.expires_at || ''}:${session.access_token.slice(-24)}`
    ).slice(0, 240);
  }

  async function request(path, options = {}) {
    if (!activeAccessToken) throw new Error('Sesi login tidak tersedia.');

    const response = await fetch(`${CONFIG.supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: CONFIG.publishableKey,
        Authorization: `Bearer ${activeAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.message || payload.error_description || payload.hint || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function loadOwnProfile() {
    const rows = await request(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(activeUserId)}&select=id,full_name,role&limit=1`
    );
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function recordLogin(session) {
    const key = `eramp-login-event:${sessionIdentifier(session)}`;
    if (sessionStorage.getItem(key) === 'recorded') return;

    try {
      await request('/rest/v1/rpc/record_login_event', {
        method: 'POST',
        body: JSON.stringify({
          p_session_id: sessionIdentifier(session),
          p_user_agent: String(navigator.userAgent || '').slice(0, 500)
        })
      });
      sessionStorage.setItem(key, 'recorded');
    } catch (error) {
      // The application must remain usable even when the optional notification table
      // has not been installed yet.
      console.warn('[E-RAMP] Login event was not recorded:', error.message);
    }
  }

  function installStyles() {
    if (document.getElementById('erampLoginNotificationStyles')) return;

    const style = document.createElement('style');
    style.id = 'erampLoginNotificationStyles';
    style.textContent = `
      #${ids.wrap}{position:relative;margin-left:auto;display:flex;align-items:center}
      #${ids.button}{position:relative;width:42px;height:42px;border:1px solid #d7e1ef;border-radius:12px;background:#fff;color:#092b62;display:grid;place-items:center;cursor:pointer;font-size:19px;box-shadow:0 4px 15px rgba(9,43,98,.08)}
      #${ids.button}:hover{background:#eef5ff}
      #${ids.badge}{position:absolute;right:-5px;top:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#c62828;color:#fff;border:2px solid #fff;font:800 10px/16px system-ui;text-align:center}
      #${ids.badge}[hidden]{display:none!important}
      #${ids.panel}{position:absolute;right:0;top:50px;width:min(390px,calc(100vw - 28px));max-height:72vh;overflow:hidden;background:#fff;border:1px solid #d7e1ef;border-radius:16px;box-shadow:0 20px 60px rgba(4,25,59,.23);z-index:120}
      #${ids.panel}[hidden]{display:none!important}
      .eramp-login-panel-head{display:flex;align-items:flex-start;gap:12px;padding:15px 16px 12px;border-bottom:1px solid #e5ebf4}
      .eramp-login-panel-head strong{display:block;color:#092b62;font-size:14px}
      .eramp-login-panel-head small{display:block;color:#66758d;font-size:11px;margin-top:2px}
      .eramp-login-panel-head button{margin-left:auto;border:0;background:#edf4ff;color:#092b62;border-radius:9px;padding:7px 9px;cursor:pointer;font-weight:800}
      #${ids.list}{max-height:50vh;overflow:auto}
      .eramp-login-row{display:grid;grid-template-columns:38px 1fr;gap:10px;padding:12px 15px;border-bottom:1px solid #edf1f7;background:#fff}
      .eramp-login-row.unread{background:#f2f7ff}
      .eramp-login-avatar{width:38px;height:38px;border-radius:50%;background:#092b62;color:#fff;display:grid;place-items:center;font:800 12px system-ui}
      .eramp-login-name{font-weight:800;color:#17233a;font-size:13px}
      .eramp-login-email,.eramp-login-meta{font-size:11px;color:#66758d;overflow-wrap:anywhere}
      .eramp-login-meta{margin-top:4px}
      .eramp-login-empty{padding:28px 16px;text-align:center;color:#66758d;font-size:12px}
      .eramp-login-panel-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;background:#f7f9fc;border-top:1px solid #e5ebf4}
      .eramp-login-panel-foot span{font-size:10px;color:#748096}
      #${ids.markRead}{border:0;border-radius:9px;background:#092b62;color:#fff;padding:8px 10px;font:800 11px system-ui;cursor:pointer}
      .eramp-admin-toast{position:fixed;right:22px;bottom:22px;z-index:9999;max-width:360px;padding:13px 16px;border-radius:11px;background:#092b62;color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.25);font:700 12px/1.45 system-ui;animation:erampToastIn .22s ease both}
      @keyframes erampToastIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
      @media(max-width:700px){
        #${ids.wrap}{margin-left:8px}
        #${ids.panel}{position:fixed;top:72px;left:14px;right:14px;width:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function initials(nameOrEmail = '') {
    const source = String(nameOrEmail).trim();
    if (!source) return 'U';
    const name = source.includes('@') ? source.split('@')[0] : source;
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function formatLoginTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jayapura'
    }).format(date) + ' WIT';
  }

  function deviceSummary(userAgent = '') {
    const ua = String(userAgent);
    const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Ponsel/tablet' : 'Komputer';
    let browser = 'Browser';
    if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua)) browser = 'Google Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    return `${device} • ${browser}`;
  }

  function showAdminToast(message) {
    document.querySelectorAll('.eramp-admin-toast').forEach((node) => node.remove());
    const toast = document.createElement('div');
    toast.className = 'eramp-admin-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 5200);
  }

  function mountAdminUi() {
    if (document.getElementById(ids.wrap)) return true;

    const topbar = document.querySelector('.topbar');
    if (!topbar) return false;

    installStyles();
    const profile = topbar.querySelector('.profile-chip');
    const wrap = document.createElement('div');
    wrap.id = ids.wrap;
    wrap.innerHTML = `
      <button id="${ids.button}" type="button" aria-label="Pemberitahuan aktivitas login" aria-expanded="false">
        🔔
        <span id="${ids.badge}" hidden>0</span>
      </button>
      <section id="${ids.panel}" hidden aria-label="Aktivitas login pengguna">
        <div class="eramp-login-panel-head">
          <div>
            <strong>Aktivitas Login</strong>
            <small>Nama, email, peran, waktu, dan perangkat</small>
          </div>
          <button id="${ids.refresh}" type="button" aria-label="Muat ulang">↻</button>
        </div>
        <div id="${ids.list}"><div class="eramp-login-empty">Memuat data login...</div></div>
        <div class="eramp-login-panel-foot">
          <span>Hanya terlihat oleh admin</span>
          <button id="${ids.markRead}" type="button">Tandai sudah dibaca</button>
        </div>
      </section>
    `;

    if (profile) topbar.insertBefore(wrap, profile);
    else topbar.appendChild(wrap);

    const button = document.getElementById(ids.button);
    const panel = document.getElementById(ids.panel);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });

    panel.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', () => {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    });

    document.getElementById(ids.refresh).addEventListener('click', () => loadLoginEvents(false));
    document.getElementById(ids.markRead).addEventListener('click', markAllRead);
    return true;
  }

  function renderLoginEvents(rows) {
    const list = document.getElementById(ids.list);
    const badge = document.getElementById(ids.badge);
    if (!list || !badge) return;

    const unread = rows.filter((row) => !row.read_at).length;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;

    if (!rows.length) {
      list.innerHTML = '<div class="eramp-login-empty">Belum ada aktivitas login yang tercatat.</div>';
      return;
    }

    list.innerHTML = rows.map((row) => `
      <article class="eramp-login-row ${row.read_at ? '' : 'unread'}">
        <div class="eramp-login-avatar">${escapeHtml(initials(row.full_name || row.email))}</div>
        <div>
          <div class="eramp-login-name">${escapeHtml(row.full_name || 'Pengguna')}</div>
          <div class="eramp-login-email">${escapeHtml(row.email || '-')}</div>
          <div class="eramp-login-meta">${escapeHtml(row.role || 'inspector')} • ${escapeHtml(formatLoginTime(row.logged_in_at))}</div>
          <div class="eramp-login-meta">${escapeHtml(deviceSummary(row.user_agent))}</div>
        </div>
      </article>
    `).join('');
  }

  function normaliseId(value) {
    try {
      return BigInt(String(value));
    } catch {
      return BigInt(0);
    }
  }

  async function loadLoginEvents(showNewToast = true) {
    if (isLoading || currentProfile?.role !== 'admin') return;
    isLoading = true;

    try {
      const rows = await request(
        `/rest/v1/login_events?select=id,user_id,full_name,email,role,logged_in_at,user_agent,read_at&order=logged_in_at.desc&limit=${CONFIG.maxRows}`
      );
      const safeRows = Array.isArray(rows) ? rows : [];

      if (initialLoadComplete && showNewToast && safeRows.length && latestKnownId !== null) {
        const newest = normaliseId(safeRows[0].id);
        if (newest > normaliseId(latestKnownId)) {
          const event = safeRows[0];
          showAdminToast(`Login baru: ${event.full_name || event.email || 'pengguna'} (${formatLoginTime(event.logged_in_at)})`);
        }
      }

      latestKnownId = safeRows[0]?.id ?? latestKnownId;
      initialLoadComplete = true;
      renderLoginEvents(safeRows);
    } catch (error) {
      console.warn('[E-RAMP] Login notifications could not be loaded:', error.message);
      const list = document.getElementById(ids.list);
      if (list) list.innerHTML = `<div class="eramp-login-empty">Pemberitahuan belum siap: ${escapeHtml(error.message)}</div>`;
    } finally {
      isLoading = false;
    }
  }

  async function markAllRead() {
    try {
      await request('/rest/v1/login_events?read_at=is.null', {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
      await loadLoginEvents(false);
    } catch (error) {
      showAdminToast(`Gagal menandai pemberitahuan: ${error.message}`);
    }
  }

  function startAdminPolling() {
    stopAdminPolling();
    loadLoginEvents(false);
    pollTimer = window.setInterval(() => loadLoginEvents(true), CONFIG.pollIntervalMs);
  }

  function stopAdminPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
  }

  function removeAdminUi() {
    stopAdminPolling();
    document.getElementById(ids.wrap)?.remove();
    latestKnownId = null;
    initialLoadComplete = false;
  }

  async function handleSession(session) {
    if (!session?.access_token || !session.user?.id) {
      activeAccessToken = '';
      activeUserId = '';
      currentProfile = null;
      removeAdminUi();
      return;
    }

    const sessionChanged =
      activeAccessToken !== session.access_token ||
      activeUserId !== session.user.id;

    activeAccessToken = session.access_token;
    activeUserId = session.user.id;

    if (sessionChanged) await recordLogin(session);

    try {
      currentProfile = await loadOwnProfile();
    } catch (error) {
      console.warn('[E-RAMP] Profile could not be loaded for notification feature:', error.message);
      return;
    }

    if (currentProfile?.role === 'admin') {
      const mount = () => {
        if (mountAdminUi()) {
          startAdminPolling();
          return true;
        }
        return false;
      };

      if (!mount()) {
        let attempts = 0;
        const mountTimer = window.setInterval(() => {
          attempts += 1;
          if (mount() || attempts >= 30) window.clearInterval(mountTimer);
        }, 500);
      }
    } else {
      removeAdminUi();
    }
  }

  async function checkSession() {
    await handleSession(getStoredSession());
  }

  window.addEventListener('storage', (event) => {
    if (event.key?.includes('auth-token')) checkSession();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentProfile?.role === 'admin') loadLoginEvents(true);
  });

  checkSession();
  sessionTimer = window.setInterval(checkSession, CONFIG.sessionCheckMs);

  window.addEventListener('beforeunload', () => {
    if (sessionTimer) window.clearInterval(sessionTimer);
    stopAdminPolling();
  });
})();
