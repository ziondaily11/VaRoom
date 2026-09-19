/* Shared role-aware mobile navigation for authenticated VaRoom pages. */
(function (window, document) {
  'use strict';

  var ICONS = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h2.5a1 1 0 0 0 1-1v-9"/></svg>',
    marketplace: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-6 2 2-6 6-2Z"/></svg>',
    create: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
    bookings: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    notifications: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 0-3.46 0"/></svg>'
  };

  var CLIENT_ITEMS = [
    { key: 'home', label: 'Home', href: '/client-home' },
    { key: 'marketplace', label: 'Marketplace', href: '/marketplace' },
    { key: 'chats', label: 'Chats', href: '/chats' },
    { key: 'bookings', label: 'Bookings', href: '/bookings' },
    { key: 'notifications', label: 'Notifications', href: '/notifications' }
  ];

  var HOST_ITEMS = [
    { key: 'home', label: 'Home', href: '/host-home' },
    { key: 'marketplace', label: 'Marketplace', href: '/marketplace' },
    { key: 'create', label: 'Create', href: '/list' },
    { key: 'chats', label: 'Chats', href: '/chats' },
    { key: 'bookings', label: 'Bookings', href: '/bookings' }
  ];

  function removePageSpecificBars() {
    document.querySelectorAll('.bottom-bar, .mobile-bottom-nav').forEach(function (bar) {
      bar.remove();
    });
  }

  function activeKey() {
    var path = window.location.pathname;
    if (path === '/marketplace') return 'marketplace';
    if (path === '/chats' || path === '/chat') return 'chats';
    if (path === '/bookings' || path === '/booking' || path === '/booking-approved') return 'bookings';
    if (path === '/notifications') return 'notifications';
    if (path === '/list') return 'create';
    if (path === '/host-home' || path === '/client-home' || path === '/') return 'home';
    return null;
  }

  function addStyles() {
    if (document.getElementById('varoom-mobile-nav-styles')) return;
    var style = document.createElement('style');
    style.id = 'varoom-mobile-nav-styles';
    style.textContent = [
      '.varoom-mobile-nav{display:none;}',
      '@media (max-width:860px){',
      'body{padding-bottom:5.1rem;}',
      'body.chat-page-context .varoom-mobile-nav{display:none;}',
      'body.chat-page-context{padding-bottom:0;}',
      '.varoom-mobile-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;position:fixed;bottom:0;left:50%;width:min(100% - 1rem,32rem);transform:translateX(-50%);z-index:150;min-height:3.7rem;padding:.3rem .35rem calc(.3rem + env(safe-area-inset-bottom));margin-bottom:max(.45rem,env(safe-area-inset-bottom));background:var(--white,var(--card-bg,#fff));border:1px solid var(--line-soft,var(--card-border,#ddd));border-radius:999px;box-shadow:0 10px 28px rgba(26,18,16,.14);}',
      '.varoom-mobile-nav.is-scroll-hidden{transform:translateX(-50%) translateY(110%);}',
      '.varoom-mobile-nav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.18rem;min-width:0;min-height:2.85rem;padding:.35rem .2rem;border-radius:999px;color:var(--ink,var(--muted,#666));font-size:.62rem;font-weight:600;line-height:1;white-space:nowrap;text-decoration:none;}',
      '.varoom-mobile-nav a.active{background:var(--red,#c41e3a);color:#fff;font-weight:700;}',
      '.varoom-mobile-nav svg{width:1.05rem;height:1.05rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;}',
      '.varoom-mobile-nav a:focus-visible{outline:2px solid var(--red,#c41e3a);outline-offset:-2px;}',
      '.varoom-mobile-nav{transition:transform 220ms ease;}',
      '}',
      '@media (prefers-reduced-motion:reduce){.varoom-mobile-nav{transition:none;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function render(role) {
    removePageSpecificBars();
    addStyles();
    var items = role === 'host' ? HOST_ITEMS : CLIENT_ITEMS;
    var active = activeKey();
    var nav = document.createElement('nav');
    nav.className = 'varoom-mobile-nav';
    nav.setAttribute('aria-label', role === 'host' ? 'Host mobile navigation' : 'Client mobile navigation');
    nav.setAttribute('data-role', role);
    nav.innerHTML = items.map(function (item) {
      var activeClass = item.key === active ? ' class="active"' : '';
      var current = item.key === active ? ' aria-current="page"' : '';
      return '<a href="' + item.href + '"' + activeClass + current + ' data-mobile-nav="' + item.key + '">' +
        ICONS[item.key] + '<span>' + item.label + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    var pathname = window.location.pathname;
    if ((role === 'client' && (pathname === '/client-home' || pathname === '/bookings' ||
        pathname === '/booking' || pathname === '/booking-approved')) ||
        (role === 'host' && (pathname === '/host-home' || pathname === '/bookings' ||
        pathname === '/booking' || pathname === '/booking-approved'))) {
      setupDiscoverScrollBehavior(nav);
    }
  }

  function setupDiscoverScrollBehavior(nav) {
    var lastPosition = getScrollPosition();
    var threshold = 8;
    var scrollArea = document.querySelector('.feed-area');

    function updateVisibility() {
      var position = getScrollPosition();
      var delta = position - lastPosition;
      if (position <= 0) {
        nav.classList.remove('is-scroll-hidden');
      } else if (delta >= threshold) {
        nav.classList.add('is-scroll-hidden');
      } else if (delta <= -threshold) {
        nav.classList.remove('is-scroll-hidden');
      }
      if (Math.abs(delta) >= threshold) lastPosition = position;
    }

    window.addEventListener('scroll', updateVisibility, { passive: true });
    if (scrollArea) scrollArea.addEventListener('scroll', updateVisibility, { passive: true });
  }

  function getScrollPosition() {
    var scrollArea = document.querySelector('.feed-area');
    return Math.max(window.scrollY || 0, scrollArea ? scrollArea.scrollTop : 0);
  }

  var supabaseWaitAttempts = 0;
  function waitForSupabase() {
    if (window.supabaseClient && window.supabaseClient.auth) {
      mount();
      return;
    }
    if (supabaseWaitAttempts >= 200) return;
    supabaseWaitAttempts += 1;
    window.setTimeout(waitForSupabase, 50);
  }

  async function mount() {
    removePageSpecificBars();
    if (!window.supabaseClient || !window.supabaseClient.auth) return;

    try {
      var sessionResult = await window.supabaseClient.auth.getSession();
      var session = sessionResult && sessionResult.data && sessionResult.data.session;
      if (!session) return;
      var profileResult = await window.supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profileResult.error) throw profileResult.error;
      var role = profileResult.data && profileResult.data.role;
      if (role !== 'host' && role !== 'client') {
        throw new Error('Unable to determine authenticated VaRoom role');
      }
      render(role);
    } catch (error) {
      console.error('Mobile navigation role resolution failed:', error);
    }
  }

  window.VaroomMobileNav = { mount: mount };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForSupabase, { once: true });
  } else {
    waitForSupabase();
  }
})(window, document);
