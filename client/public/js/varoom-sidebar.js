/**
 * VaRoom Shared Sidebar Component
 * --------------------------------
 * Reusable sidebar matching Client Home (/client-home) and Host Home (/host-home)
 * authoritative implementations.
 */
(function (window) {
  'use strict';

  var ICONS = {
    elie: '<svg width="22" height="22" viewBox="0 0 32 32" fill="none" class="elie-icon" color="currentColor" role="img" aria-label="Elie"><path d="M16 4.5V2.75" stroke="#D92D3F" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="2.25" r="1.25" fill="#D92D3F"/><rect x="4.25" y="6.25" width="23.5" height="20" rx="7" fill="#FFFFFF" stroke="currentColor" stroke-width="1.8"/><path d="M4.75 13.25h22.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="11" cy="17.25" r="1.6" fill="currentColor"/><circle cx="21" cy="17.25" r="1.6" fill="currentColor"/><path d="M11.5 21c1.25 1 2.55 1.5 4.5 1.5s3.25-.5 4.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6.5" cy="17.5" r="1" fill="#D92D3F"/><circle cx="25.5" cy="17.5" r="1" fill="#D92D3F"/></svg>',
    home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 0 0 0 1 1v4h2.5a1 1 0 0 0 1-1v-9"/></svg>',
    marketplace: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-6 2 2-6 6-2Z"/></svg>',
    saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z"/></svg>',
    bookings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    chats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
    transactions: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>',
    notifications: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    listSpace: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    myListings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 9h9M7.5 13h9M7.5 17h5"/></svg>',
    payments: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>',
    analytics: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V10M11 19V5M18 19v-7"/><path d="M3 19h18"/></svg>',
    profile: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    support: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.6-2.4 1.9-2.4 3.5"/><path d="M12 17.2v.1"/></svg>'
  };

  function itemClass(active) {
    return active ? 'nav-item active' : 'nav-item';
  }

  function getClientSidebarHtml(options) {
    var activeNav = (options && options.activeNav) || 'notifications';

    return [
      '<a href="/client-home" class="logo"><span class="va">Va</span><span class="room">Room</span></a>',

      '<nav class="nav-group">',
      '  <a href="/elie" class="' + itemClass(activeNav === 'elie') + '">',
      '    <span data-elie-icon aria-label="Elie" class="elie-logo-nav">' + ICONS.elie + '</span>',
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
      '  <a href="/transactions" class="' + itemClass(activeNav === 'transactions') + '">',
      '    ' + ICONS.transactions,
      '    Transactions',
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
    var activeNav = (options && options.activeNav) || 'notifications';
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
      '  <a href="/elie" class="' + itemClass(activeNav === 'elie') + '">',
      '    <span data-elie-icon aria-label="Elie" class="elie-logo-nav">' + ICONS.elie + '</span>',
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
      '    <span class="notif-nav-badge" id="notif-nav-badge" hidden></span>',
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
      '  <a href="/payments" class="' + itemClass(activeNav === 'payments') + '">',
      '    ' + ICONS.payments,
      '    Payments',
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

  function mount(options) {
    options = options || {};
    var role = options.role === 'host' ? 'host' : 'client';
    var container = options.container || document.getElementById('sidebar');
    if (!container) return;

    var html = role === 'host' ? getHostSidebarHtml(options) : getClientSidebarHtml(options);
    container.innerHTML = html;

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
    var badge = document.getElementById('notif-nav-badge');
    if (!badge) return;
    var num = Number(count) || 0;
    if (num > 0) {
      badge.textContent = num > 99 ? '99+' : String(num);
      badge.hidden = false;
    } else {
      badge.textContent = '';
      badge.hidden = true;
    }
  }

  window.VaroomSidebar = {
    getClientSidebarHtml: getClientSidebarHtml,
    getHostSidebarHtml: getHostSidebarHtml,
    mount: mount,
    open: openSidebar,
    close: closeSidebar,
    setUnreadCount: setUnreadCount
  };
})(window);
