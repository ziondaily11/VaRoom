/**
 * VaRoom Shared Sidebar Component
 * --------------------------------
 * Reusable sidebar matching Client Home (/client-home) and Host Home (/host-home)
 * authoritative implementations.
 */
(function (window) {
  'use strict';

  var ICONS = {
    elie: '<span data-elie-bot-avatar="true" data-avatar-size="22" class="elie-logo-nav" aria-label="Elie, AI assistant"></span>',
    home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 0 0 0 1 1v4h2.5a1 1 0 0 0 1-1v-9"/></svg>',
    marketplace: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-6 2 2-6 6-2Z"/></svg>',
    saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z"/></svg>',
    bookings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    chats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
    notifications: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    listSpace: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    myListings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 9h9M7.5 13h9M7.5 17h5"/></svg>',
    analytics: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V10M11 19V5M18 19v-7"/><path d="M3 19h18"/></svg>',
    profile: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    support: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5"/><path d="M12 17.2v.1"/></svg>',
    upgrade: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="m19 16 .7 1.8L21.5 18l-1.8.7 1.8.7L19 20.5l-.7-1.8-1.8-.7 1.8-.7L19 16Z"/></svg>'
  };

  function itemClass(active) {
    return active ? 'nav-item active' : 'nav-item';
  }

  function activeNavFromLocation() {
    var pathname = window.location.pathname;
    if (pathname === '/analytics' || pathname === '/analytics.html') return 'analytics';
    return pathname === '/pricing' || pathname === '/pricing.html' ? 'upgrade' : null;
  }

  function getClientSidebarHtml(options) {
    var activeNav = (options && options.activeNav) || activeNavFromLocation() || 'notifications';

    return [
      '<a href="/client-home" class="logo"><span class="va">Va</span><span class="room">Room</span></a>',

      '<nav class="nav-group">',
      '  <a href="/chats?conversation=elie" class="' + itemClass(activeNav === 'elie') + '">',
      '    ' + ICONS.elie,
      '    Elie',
      '    <span class="beta-pill">Free preview</span>',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <a href="/client-home" class="' + itemClass(activeNav === 'home') + '" data-nav="home">',
      '    ' + ICONS.home,
      '    Home',
      '  </a>',
      '  <a href="/marketplace" class="' + itemClass(activeNav === 'marketplace') + '" data-nav="marketplace">',
      '    ' + ICONS.marketplace,
      '    Marketplace',
      '  </a>',
      '  <a href="/client-home?view=saved" class="' + itemClass(activeNav === 'saved') + '" data-nav="saved" data-mobile-hide>',
      '    ' + ICONS.saved,
      '    Saved',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <p class="nav-label">My activity</p>',
      '  <a href="/bookings" class="' + itemClass(activeNav === 'bookings') + '">',
      '    ' + ICONS.bookings,
      '    Bookings',
      '  </a>',
      '  <a href="/chats" class="' + itemClass(activeNav === 'chats') + '" data-mobile-hide>',
      '    ' + ICONS.chats,
      '    Chats',
      '  </a>',
      '  <a href="/notifications" class="' + itemClass(activeNav === 'notifications') + '" id="notif-nav-item">',
      '    ' + ICONS.notifications,
      '    Notifications',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <p class="nav-label">Account</p>',
      '  <a href="/profile" class="' + itemClass(activeNav === 'profile') + '">',
      '    ' + ICONS.profile,
      '    Profile',
      '  </a>',
      '  <a href="/settings" class="' + itemClass(activeNav === 'settings') + '">',
      '    ' + ICONS.settings,
      '    Settings',
      '  </a>',
      '  <a href="/support" class="' + itemClass(activeNav === 'support') + '">',
      '    ' + ICONS.support,
      '    Help &amp; Support',
      '  </a>',
      '</nav>',

      '<div class="sidebar-note">',
      '  <strong>Book with confidence</strong>',
      '  GPS-verified listings and verified hosts help you know what\'s real before you reach out.',
      '</div>',

      '<button type="button" class="logout-btn" id="logout-btn">Log out</button>'
    ].join('\n');
  }

  function getHostSidebarHtml(options) {
    var activeNav = (options && options.activeNav) || activeNavFromLocation() || 'notifications';
    var profile = (options && options.profile) || {};
    var isVerified = Boolean(profile.verified);

    var verifyBoxHtml = isVerified
      ? '<div class="verify-box is-verified" id="verify-box"><strong>You\'re verified!</strong>Your account is verified. Keep providing great experiences.</div>'
      : '<div class="verify-box not-verified" id="verify-box"><strong>Get verified</strong>Verification isn\'t self-serve yet — reach out via Help &amp; Support to get your blue tick.</div>';

    return [
      '<a href="/host-home" class="logo">',
      '  <span class="va">Va</span><span class="room">Room</span>',
      '</a>',

      '<nav class="nav-group">',
      '  <a href="/chats?conversation=elie" class="' + itemClass(activeNav === 'elie') + '">',
      '    ' + ICONS.elie,
      '    Elie',
      '    <span class="beta-pill">Free preview</span>',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <a href="/host-home" class="' + itemClass(activeNav === 'home') + '" data-nav="home">',
      '    ' + ICONS.home,
      '    Home',
      '  </a>',
      '  <a href="/marketplace" class="' + itemClass(activeNav === 'marketplace') + '" data-nav="marketplace">',
      '    ' + ICONS.marketplace,
      '    Marketplace',
      '  </a>',
      '  <a href="/host-home?view=saved" class="' + itemClass(activeNav === 'saved') + '" data-nav="saved">',
      '    ' + ICONS.saved,
      '    Saved',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <p class="nav-label">My activity</p>',
      '  <a href="/bookings" class="' + itemClass(activeNav === 'bookings') + '">',
      '    ' + ICONS.bookings,
      '    Bookings',
      '  </a>',
      '  <a href="/chats" class="' + itemClass(activeNav === 'chats') + '" data-mobile-hide>',
      '    ' + ICONS.chats,
      '    Chats',
      '  </a>',
      '  <a href="/notifications" class="' + itemClass(activeNav === 'notifications') + '" id="notif-nav-item">',
      '    ' + ICONS.notifications,
      '    Notifications',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <p class="nav-label">Host</p>',
      '  <a href="/list" class="list-space-btn">',
      '    ' + ICONS.listSpace,
      '    List a space',
      '  </a>',
      '  <a href="/host-home?view=my-listings" class="' + itemClass(activeNav === 'my-listings') + '" data-nav="my-listings">',
      '    ' + ICONS.myListings,
      '    My Listings',
      '  </a>',
      '  <a href="/analytics" class="' + itemClass(activeNav === 'analytics') + '">',
      '    ' + ICONS.analytics,
      '    Analytics',
      '  </a>',
      '</nav>',

      '<nav class="nav-group">',
      '  <p class="nav-label">Account</p>',
      '  <a href="/profile" class="' + itemClass(activeNav === 'profile') + '">',
      '    ' + ICONS.profile,
      '    Profile',
      '  </a>',
      '  <a href="/settings" class="' + itemClass(activeNav === 'settings') + '">',
      '    ' + ICONS.settings,
      '    Settings',
      '  </a>',
      '  <a href="/support" class="' + itemClass(activeNav === 'support') + '">',
      '    ' + ICONS.support,
      '    Help &amp; Support',
      '  </a>',
      '  <a href="pricing.html" class="' + itemClass(activeNav === 'upgrade') + '">',
      '    ' + ICONS.upgrade,
      '    Upgrade',
      '  </a>',
      '</nav>',

      verifyBoxHtml,

      '<button type="button" class="logout-btn" id="logout-btn">Log out</button>'
    ].join('\n');
  }

  function openSidebar() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('show');
  }

  function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('show');
  }

  var countState = {
    client: null,
    userId: null,
    role: null,
    channel: null,
    refreshTimer: null,
    refreshInterval: null,
    observer: null,
    initialized: false
  };

  function installCountStyles() {
    if (document.getElementById('varoom-count-badge-styles')) return;
    var style = document.createElement('style');
    style.id = 'varoom-count-badge-styles';
    style.textContent = [
      ':root{--nav-badge-bg:#E9E7E2;--nav-badge-color:#24211E;}',
      '[data-theme="dark"]{--nav-badge-bg:#484441;--nav-badge-color:#F5EFEC;}',
      '.varoom-count-badge{position:absolute;top:50%;right:.55rem;z-index:2;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--nav-badge-bg);color:var(--nav-badge-color);display:flex;align-items:center;justify-content:center;font:700 10px/1 Arial,sans-serif;white-space:nowrap;box-sizing:border-box;transform:translateY(-50%);}',
      '.varoom-count-badge[hidden]{display:none;}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureCountBadges() {
    installCountStyles();
    var targets = [
      { selector: '#sidebar a[href^="/bookings"], #sidebar button[data-count-kind="bookings"]', kind: 'bookings', label: 'new bookings' },
      { selector: '#sidebar a[href="/chats"], #sidebar button[data-count-kind="chats"]', kind: 'chats', label: 'unread conversations' },
      { selector: '#sidebar a[href^="/notifications"], #sidebar button#notif-nav-item, #sidebar button[data-count-kind="notifications"]', kind: 'notifications', label: 'unread notifications' },
      { selector: '#chatRoleNavigation a[href^="/bookings"]', kind: 'bookings', label: 'new bookings' },
      { selector: '#chatRoleNavigation a[href="/chats"]', kind: 'chats', label: 'unread conversations' },
      { selector: '#chatRoleNavigation a[href^="/notifications"]', kind: 'notifications', label: 'unread notifications' }
    ];
    targets.forEach(function (target) {
      document.querySelectorAll(target.selector).forEach(function (item) {
        var badge = item.querySelector('.varoom-count-badge[data-count-kind="' + target.kind + '"]');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'varoom-count-badge';
          badge.setAttribute('data-count-kind', target.kind);
          badge.hidden = true;
          item.appendChild(badge);
        }
        badge.setAttribute('aria-label', target.label);
      });
    });
  }

  function setCount(kind, count) {
    var num = Number(count);
    if (!Number.isFinite(num) || num < 0) num = 0;
    ensureCountBadges();
    document.querySelectorAll('.varoom-count-badge[data-count-kind="' + kind + '"]').forEach(function (badge) {
      badge.textContent = num > 0 ? String(num) : '';
      badge.hidden = num === 0;
      badge.setAttribute('aria-label', num + (kind === 'bookings' ? ' new bookings' :
        kind === 'chats' ? ' unread conversations' : ' unread notifications'));
    });
  }

  function refreshCounts() {
    if (!countState.client || !countState.userId || !countState.role) return Promise.resolve();
    var client = countState.client;
    var userId = countState.userId;
    ensureCountBadges();

    var notificationsQuery = client.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .eq('read', false);
    var bookingsQuery = (function () {
      var seenBookings = Object.create(null);
      var offset = 0;
      var pageSize = 1000;
      function loadPage() {
        return client.from('notifications').select('booking_id,related_entity_id')
          .eq('recipient_user_id', userId).eq('read', false)
          .in('type', ['booking_request', 'booking_approved', 'booking_declined', 'booking_cancelled'])
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
          .then(function (result) {
            if (result.error) throw result.error;
            (result.data || []).forEach(function (notification, index) {
              var bookingId = notification.booking_id || notification.related_entity_id;
              seenBookings[bookingId || 'notification-' + offset + '-' + index] = true;
            });
            if ((result.data || []).length === pageSize) {
              offset += pageSize;
              return loadPage();
            }
            return Object.keys(seenBookings).length;
          });
      }
      return loadPage();
    }());
    var unreadConversationsQuery = client.auth.getSession().then(function (sessionResult) {
      if (sessionResult.error) throw sessionResult.error;
      var session = sessionResult.data && sessionResult.data.session;
      if (!session) throw new Error('The current session is unavailable.');
      return fetch('/api/chat/unread-count', {
        headers: { Authorization: 'Bearer ' + session.access_token }
      }).then(function (response) {
        if (!response.ok) throw new Error('Unable to load unread conversations (' + response.status + ').');
        return response.json();
      }).then(function (payload) {
        return Number(payload.count) || 0;
      });
    });

    return Promise.all([
      notificationsQuery,
      bookingsQuery,
      unreadConversationsQuery
    ]).then(function (results) {
      var notificationResult = results[0];
      if (notificationResult.error) throw notificationResult.error;
      setCount('bookings', results[1]);
      setCount('notifications', notificationResult.count || 0);
      setCount('chats', results[2]);
    }).catch(function (error) {
      console.error('Unable to refresh sidebar counts:', error);
    });
  }

  function scheduleCountRefresh() {
    if (countState.refreshTimer) window.clearTimeout(countState.refreshTimer);
    countState.refreshTimer = window.setTimeout(refreshCounts, 150);
  }

  function initCounts(options) {
    options = options || {};
    var client = options.supabaseClient || window.supabaseClient;
    if (!client || !client.auth) return Promise.resolve();
    return client.auth.getSession().then(function (sessionResult) {
      if (sessionResult.error) throw sessionResult.error;
      var session = sessionResult.data && sessionResult.data.session;
      if (!session) return;
      var userId = session.user.id;
      if (countState.initialized && countState.userId === userId) {
        countState.client = client;
        return refreshCounts();
      }
      return client.from('profiles').select('role').eq('id', userId).maybeSingle().then(function (profileResult) {
        if (profileResult.error) throw profileResult.error;
        countState.client = client;
        countState.userId = userId;
        countState.role = profileResult.data && profileResult.data.role === 'host' ? 'host' : 'client';
        countState.initialized = true;

        if (countState.channel) client.removeChannel(countState.channel);
        countState.channel = client.channel('sidebar-counts-' + userId)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'notifications',
            filter: 'recipient_user_id=eq.' + userId
          }, scheduleCountRefresh)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'messages'
          }, scheduleCountRefresh);
        countState.channel.subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('Sidebar count realtime subscription failed:', status);
          }
        });

        if (!countState.observer) {
          countState.observer = new MutationObserver(ensureCountBadges);
          countState.observer.observe(document.body, { childList: true, subtree: true });
        }
        if (!countState.refreshInterval) countState.refreshInterval = window.setInterval(refreshCounts, 60000);
        if (!countState.visibilityHandler) {
          countState.visibilityHandler = function () {
            if (document.visibilityState === 'visible') refreshCounts();
          };
          document.addEventListener('visibilitychange', countState.visibilityHandler);
        }
        return refreshCounts();
      });
    }).catch(function (error) {
      console.error('Unable to initialize sidebar counts:', error);
    });
  }

  function mount(options) {
    options = options || {};
    var role = options.role === 'host' ? 'host' : 'client';
    var container = options.container || document.getElementById('sidebar');
    if (!container) return;

    container.classList.toggle('sidebar-host', role === 'host');
    container.classList.toggle('sidebar-client', role !== 'host');
    var html = role === 'host' ? getHostSidebarHtml(options) : getClientSidebarHtml(options);
    container.innerHTML = html;
    ensureCountBadges();

    // Verify box state update if host
    if (role === 'host' && options.profile) {
      var verifyBox = container.querySelector('#verify-box');
      if (verifyBox) {
        if (options.profile.verified) {
          verifyBox.className = 'verify-box is-verified';
          verifyBox.innerHTML = '<strong>You\'re verified!</strong>Your account is verified. Keep providing great experiences.';
        } else {
          verifyBox.className = 'verify-box not-verified';
          verifyBox.innerHTML = '<strong>Get verified</strong>Verification isn\'t self-serve yet — reach out via Help &amp; Support to get your blue tick.';
        }
      }
    }

    // Logout handling
    var logoutBtn = container.querySelector('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        var client = options.supabaseClient || window.supabaseClient;
        if (client && client.auth) {
          try { await client.auth.signOut(); } catch (err) { console.error('Sign out error:', err); }
        }
        window.location.href = '/login';
      });
    }

    // Backdrop dismissal
    var backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
      backdrop.removeEventListener('click', closeSidebar);
      backdrop.addEventListener('click', closeSidebar);
    }

    // Nav-item click dismissal on mobile
    container.querySelectorAll('.nav-item, .list-space-btn, .logout-btn').forEach(function (el) {
      el.addEventListener('click', closeSidebar);
    });

    // Wire external menu toggles if present
    var menuToggle = document.getElementById('menu-toggle') || document.querySelector('.menu-toggle');
    if (menuToggle) {
      menuToggle.removeEventListener('click', openSidebar);
      menuToggle.addEventListener('click', openSidebar);
    }

    // Persist cached role in session storage for faster zero-flicker reload
    try {
      window.sessionStorage.setItem('varoom_user_role', role);
    } catch (e) {}
  }

  function setUnreadCount(count) {
    setCount('notifications', count);
  }

  window.VaroomSidebar = {
    getClientSidebarHtml: getClientSidebarHtml,
    getHostSidebarHtml: getHostSidebarHtml,
    mount: mount,
    open: openSidebar,
    close: closeSidebar,
    setUnreadCount: setUnreadCount,
    setCount: setCount,
    initCounts: initCounts
  };
})(window);
