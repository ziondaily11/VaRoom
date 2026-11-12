// Styles for the persistent app shell (A5c). The host and client sets are the
// former HostLayout/ClientLayout styles, unchanged; legacy pages and tests
// depend on their selectors (.host-app-layout, .client-app-layout,
// #host-page-content, .client-page-content, the 295px / 260px grids).

export const HOST_SHELL_STYLES = `
  /* ---------- Host Application Layout ---------- */
  .host-app-layout {
    --layout-bg: #FFFFFF;
    --layout-ink: #0F1419;
    --layout-muted: #536471;
    --layout-line: #EFF3F4;
    --layout-line-soft: #EFF3F4;
    --layout-control-hover: #EFEDE8;
    --layout-control-active: #E9E7E2;
    --layout-popover-bg: #FFFFFF;
    --layout-popover-border: rgba(0, 0, 0, 0.08);
    --layout-popover-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.15);

    display: grid;
    grid-template-columns: 295px minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: var(--paper, var(--layout-bg));
    color: var(--ink, var(--layout-ink));
    font-family: var(--font-body, 'Helvetica Neue', Arial, sans-serif);
  }

  html[data-theme="dark"] .host-app-layout {
    --layout-bg: #000000;
    --layout-ink: #FFFFFF;
    --layout-muted: #71767b;
    --layout-line: #2f3336;
    --layout-line-soft: #202327;
    --layout-control-hover: rgba(239, 243, 244, 0.1);
    --layout-control-active: rgba(239, 243, 244, 0.15);
    --layout-popover-bg: #000000;
    --layout-popover-border: #2f3336;
    --layout-popover-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.85);
  }

  .host-page-content {
    min-width: 0;
    width: 100%;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    background: var(--paper, var(--layout-bg));
  }

  /* Canonical Sidebar - authoritative host-home specification */
  .host-app-layout > .sidebar {
    width: 295px;
    flex-shrink: 0;
    background: var(--paper, var(--layout-bg));
    border: none;
    border-right: 1px solid var(--line, var(--layout-line));
    border-radius: 0;
    box-shadow: none;
    margin: 0;
    padding: 0.75rem 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100vh;
    overflow-y: auto;
    scrollbar-width: none;
    box-sizing: border-box;
    z-index: 10;
  }
  .host-app-layout > .sidebar::-webkit-scrollbar { display: none; }

  .host-app-layout .logo {
    font-family: var(--font-brand, 'Fraunces', Georgia, serif);
    font-weight: 900;
    font-size: 1.5rem;
    display: flex;
    align-items: baseline;
    padding: .35rem .6rem;
    margin-bottom: .2rem;
    text-decoration: none;
  }
  .host-app-layout .logo .va { color: var(--red, #C41E3A); }
  .host-app-layout .logo .room { color: var(--ink, var(--layout-ink)); }

  .host-app-layout .nav-group { display: flex; flex-direction: column; gap: .35rem; }
  .host-app-layout .nav-group + .nav-group { border-top: 1px solid var(--line, var(--layout-line)); padding-top: .75rem; margin-top: .15rem; }
  .host-app-layout .nav-label { margin: 0; font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, var(--layout-muted)); padding: .25rem .75rem .1rem; }

  .host-app-layout .nav-item {
    position: relative; display: flex; align-items: center; gap: 1rem;
    padding: .65rem .95rem; border-radius: 9999px;
    font-size: 1rem; font-weight: 500; color: var(--ink, var(--layout-ink));
    cursor: pointer; transition: background .15s ease, color .15s ease;
    text-decoration: none; border: none; background: transparent; width: 100%; box-sizing: border-box; text-align: left;
    font-family: inherit;
  }
  .host-app-layout .nav-item:hover { background: var(--control-hover, var(--layout-control-hover)); }
  .host-app-layout .nav-item.active {
    background: var(--control-active, var(--layout-control-active)) !important;
    color: var(--ink, var(--layout-ink)) !important;
    font-weight: 700 !important;
    border: none !important;
  }
  .host-app-layout .nav-item.active svg {
    color: var(--ink, var(--layout-ink)) !important;
  }
  .host-app-layout .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }

  .host-app-layout .notif-nav-badge {
    position: absolute; top: 50%; right: .75rem; min-width: 18px; height: 18px;
    padding: 0 5px; border-radius: 999px; background: var(--red, #C41E3A); color: #fff;
    transform: translateY(-50%);
    display: flex; align-items: center; justify-content: center; font-size: .65rem; font-weight: 700; line-height: 1;
  }
  .host-app-layout .nav-item.active .notif-nav-badge {
    background: var(--nav-badge-bg, var(--layout-control-active)) !important;
    color: var(--nav-badge-color, var(--ink, var(--layout-ink))) !important;
  }

  .host-app-layout .list-space-btn {
    display: flex; align-items: center; justify-content: center; gap: .5rem;
    background: var(--red, #C41E3A) !important; color: #ffffff !important;
    border: none !important; border-radius: 9999px !important;
    padding: .75rem 1rem !important; font-size: .95rem !important; font-weight: 700 !important;
    width: 100%; box-sizing: border-box; text-decoration: none;
    box-shadow: 0 4px 14px rgba(196, 30, 58, .25);
    margin: .35rem 0;
    transition: background .18s ease, transform .15s ease;
  }
  .host-app-layout .list-space-btn:hover { background: var(--red-deep, #8F1229) !important; color: #ffffff !important; }

  /* Account menu popover */
  .host-app-layout .account-menu {
    position: fixed;
    z-index: 99999;
    background: var(--layout-popover-bg);
    color: var(--layout-ink);
    border-radius: 16px;
    border: 1px solid var(--layout-popover-border);
    box-shadow: var(--layout-popover-shadow);
    padding: .6rem .5rem .5rem;
    display: flex; flex-direction: column; gap: 0;
  }
  .host-app-layout .account-menu[hidden] { display: none !important; }

  .host-app-layout .account-menu-list { display: flex; flex-direction: column; gap: 0; padding: 0 0 .15rem; }
  .host-app-layout .account-menu-row {
    display: flex; align-items: center; gap: .75rem;
    width: 100%; padding: .65rem .65rem;
    border-radius: 12px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; text-align: left;
    color: var(--layout-ink);
  }
  .host-app-layout .account-menu-row:hover { background: var(--layout-control-hover); }
  .host-app-layout .account-menu-row.active { cursor: default; }
  .host-app-layout .account-menu-row-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--layout-control-active); color: var(--layout-ink);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .9rem;
    flex-shrink: 0; overflow: hidden;
  }
  .host-app-layout .account-menu-row-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .host-app-layout .account-menu-row-info { display: flex; flex-direction: column; gap: .06rem; min-width: 0; flex: 1; }
  .host-app-layout .account-menu-row-name { font-size: .88rem; font-weight: 700; color: var(--layout-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .host-app-layout .account-menu-row-username { font-size: .76rem; color: var(--layout-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .host-app-layout .account-menu-row-check { flex-shrink: 0; margin-left: auto; width: 22px; height: 22px; border-radius: 50%; background: #00BA7C; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 900; }

  .host-app-layout .account-menu-divider { height: 1px; background: var(--layout-line); margin: .35rem .15rem; }
  .host-app-layout .account-menu-action {
    display: flex; align-items: center; width: 100%;
    padding: .7rem .75rem;
    border-radius: 10px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: .88rem; font-weight: 600;
    text-align: left; color: var(--layout-ink); text-decoration: none;
    box-sizing: border-box;
  }
  .host-app-layout .account-menu-action:hover { background: var(--layout-control-hover); }
  .host-app-layout .account-menu-action.active { background: var(--layout-control-active); }
  .host-app-layout .account-menu-action.disabled { color: var(--layout-muted); opacity: .55; cursor: default; pointer-events: none; }
  .host-app-layout .account-menu-logout { color: var(--layout-muted); }
  .host-app-layout .account-menu-logout:hover { color: var(--red, #C41E3A); background: var(--layout-control-hover); }

  /* Account identity button */
  .host-app-layout .account-identity {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: .75rem;
    width: 100%;
    padding: .65rem .75rem;
    border-radius: 9999px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    color: var(--layout-ink);
    flex-shrink: 0;
    position: relative;
    transition: background .15s ease;
  }
  .host-app-layout .account-identity:hover { background: var(--layout-control-hover); }
  .host-app-layout .account-identity-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--layout-control-active);
    color: var(--layout-ink);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .95rem;
    flex-shrink: 0; overflow: hidden;
  }
  .host-app-layout .account-identity-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .host-app-layout .account-identity-info { display: flex; flex-direction: column; gap: .05rem; min-width: 0; flex: 1; }
  .host-app-layout .account-identity-name { font-size: .92rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--layout-ink); }
  .host-app-layout .account-identity-username { font-size: .8rem; color: var(--layout-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .host-app-layout .account-identity-dots { flex-shrink: 0; color: var(--layout-muted); margin-left: auto; }
  .host-app-layout .account-identity:hover .account-identity-dots { color: var(--layout-ink); }

  /* Mobile styles & drawer */
  .sidebar-backdrop { display: none; position: fixed; inset: 0; background: rgba(26, 18, 16, .45); z-index: 190; }
  .sidebar-backdrop.show { display: block; }

  @media (max-width: 860px) {
    .host-app-layout { grid-template-columns: 1fr; height: auto; min-height: 100vh; overflow-y: visible; }
    .host-page-content { height: auto; overflow: visible; }
    .host-app-layout > .sidebar {
      position: fixed; inset: 0 auto 0 0; width: 80vw; max-width: 360px; height: 100vh; margin: 0;
      background: var(--paper, var(--layout-bg)); border-radius: 0; z-index: 200;
      transform: translateX(-100%); transition: transform .25s ease;
      box-shadow: 0 0 40px rgba(26, 18, 16, .25);
    }
    .host-app-layout > .sidebar.mobile-open { transform: translateX(0); }
  }

  .host-app-layout .nav-item svg,
  .host-app-layout .account-identity svg {
    pointer-events: none;
  }

  /* ---------- Content isolation and duplicate sidebar suppression ---------- */
  /* When rendered inside HostLayout, any page-internal duplicate sidebar is suppressed */
  .host-layout-active .host-page-content aside.sidebar,
  .host-layout-active .host-page-content aside.profile-sidebar,
  .host-layout-active .host-page-content aside.host-profile-sidebar,
  .host-layout-active .host-page-content #sidebar,
  .host-layout-active .host-page-content #sidebar-client,
  .host-layout-active .host-page-content #sidebar-host,
  .host-layout-active .host-page-content #sidebar-shell,
  .host-layout-active .host-page-content .skeleton-sidebar {
    display: none !important;
  }

  /* When data-account-role is client, hide host-exclusive actions */
  html[data-account-role="client"] .host-app-layout .list-space-btn,
  html[data-account-role="client"] .host-app-layout [data-nav="my-listings"] {
    display: none !important;
  }

  /* Make legacy host page shells fill 100% of the content width */
  .host-layout-active .host-page-content .app-shell,
  .host-layout-active .host-page-content .app-layout,
  .host-layout-active .host-page-content .profile-layout,
  .host-layout-active .host-page-content .profile-desktop-shell,
  .host-layout-active .host-page-content .host-profile-shell {
    display: block !important;
    width: 100% !important;
    min-height: 100% !important;
    grid-template-columns: none !important;
  }

  .host-layout-active .host-page-content .main-col,
  .host-layout-active .host-page-content .profile-main-col,
  .host-layout-active .host-page-content .skeleton-main,
  .host-layout-active .host-page-content .host-profile-main {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
  }

`;

/** The icon-only rail, shared by the host and client sidebars. */
export const RAIL_STYLES = `
  /* ---------- Icon-only rail (routes that need width: /analytics, /marketplace) ---------- */
  /* Same sidebar element as every host or client page, collapsed with CSS only, so moving
     between rail and full routes never remounts it. Desktop only: below 861px
     the sidebar is the usual drawer and the mobile bottom navigation shows. */
  @media (min-width: 861px) {
    .shell-rail-layout { grid-template-columns: 76px minmax(0, 1fr); }
    .shell-rail-layout > .sidebar {
      width: 76px; padding: 1.1rem .45rem 1rem; gap: .65rem; align-items: center;
    }
    .shell-rail-layout .logo { display: flex; justify-content: center; padding: .2rem 0; }
    .shell-rail-layout .logo > span { display: none; }
    /* The VaRoom favicon at the standard 32px desktop size (96px file on sharp screens). */
    .shell-rail-layout .logo::after {
      content: ''; width: 32px; height: 32px; border-radius: 8px;
      background: url('/favicon/favicon-32_1.png') center / 32px 32px no-repeat;
      background-image: image-set(url('/favicon/favicon-32_1.png') 1x, url('/favicon/favicon-96.png') 3x);
    }
    /* Its black R needs a light tile on the dark rail. */
    html[data-theme="dark"] .shell-rail-layout .logo::after { background-color: #fff; background-size: 26px 26px; }
    .shell-rail-layout .nav-group { align-items: center; width: 100%; }
    .shell-rail-layout .nav-label { display: none; }
    .shell-rail-layout .nav-item,
    .shell-rail-layout .list-space-btn {
      justify-content: center; width: 46px !important; height: 46px; padding: 0 !important; gap: 0 !important;
      font-size: 0 !important; line-height: 0; margin-inline: auto;
    }
    .shell-rail-layout .nav-item svg { width: 20px; height: 20px; }
    .shell-rail-layout .list-space-btn svg { width: 18px; height: 18px; }
    .shell-rail-layout .notif-nav-badge { top: 3px; right: 1px; transform: none; font-size: .6rem !important; line-height: 1; }
    .shell-rail-layout .account-identity { justify-content: center; width: 52px; padding: 6px; }
    .shell-rail-layout .account-identity-info,
    .shell-rail-layout .account-identity-dots { display: none; }
    /* Menus open beside the narrow rail at their usual width. */
    .shell-rail-layout .account-menu { width: 260px !important; }
  }
`;

export const CLIENT_SHELL_STYLES = `
  /* ---------- Client Application Layout ---------- */
  .client-app-layout {
    --layout-bg: #FFFFFF;
    --layout-ink: #0F1419;
    --layout-muted: #536471;
    --layout-line: #EFF3F4;
    --layout-line-soft: #EFF3F4;
    --layout-control-hover: #EFEDE8;
    --layout-control-active: #E9E7E2;
    --layout-popover-bg: #FFFFFF;
    --layout-popover-border: rgba(0, 0, 0, 0.08);
    --layout-popover-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.15);

    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: var(--paper, var(--layout-bg));
    color: var(--ink, var(--layout-ink));
    font-family: var(--font-body, 'Helvetica Neue', Arial, sans-serif);
  }

  .client-app-layout.client-home-layout {
    --red: #C41E3A;
    --white: #FFFFFF;
    --ink: #0F1419;
    --paper: #FFFFFF;
    --surface-card: #F7F9F9;
    --muted: #536471;
    --line: #D4D8DA;
    --line-soft: #DDE1E3;
    --control-bg: #EFF3F4;
    --control-active: #E9E7E2;
    --control-hover: #EFEDE8;
    --control-strong: #0F1419;
    --control-strong-text: #FFFFFF;
    --client-control-bg: #F7F6F3;
    --client-control-active: #E9E7E2;
    --client-control-hover: #EFEDE8;
    --client-control-strong: #24211E;
    --client-control-strong-text: #FFFFFF;
    --client-neutral-icon: #5C584F;
    --client-rail-outline: #C9C5BD;
    --media-stage-fill: #F7F9F9;
    --font-brand: 'Fraunces', serif;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  html[data-theme="light"] .client-app-layout.client-home-layout {
    --muted: #374248;
    --line: #BBBFC2;
    --line-soft: #CBCFD2;
  }

  html[data-theme="dark"] .client-app-layout.client-home-layout {
    --red: #C41E3A;
    --white: #000000;
    --ink: #E7E9EA;
    --paper: #000000;
    --surface-card: #0d0d0d;
    --muted: #71767b;
    --line: #2f3336;
    --line-soft: #202327;
    --control-bg: #202327;
    --control-active: #2f3336;
    --control-hover: rgba(239, 243, 244, 0.1);
    --control-strong: #EFF3F4;
    --control-strong-text: #0F1419;
    --client-control-bg: #202327;
    --client-control-active: rgba(255, 255, 255, 0.1);
    --client-control-hover: rgba(255, 255, 255, 0.06);
    --client-control-strong: #EFF3F4;
    --client-control-strong-text: #000000;
    --client-neutral-icon: #71767b;
    --client-rail-outline: rgba(255, 255, 255, 0.12);
    --media-stage-fill: #0a0a0a;
  }

  html[data-theme="dark"] .client-app-layout {
    --layout-bg: #000000;
    --layout-ink: #FFFFFF;
    --layout-muted: #71767b;
    --layout-line: #2f3336;
    --layout-line-soft: #202327;
    --layout-control-hover: rgba(239, 243, 244, 0.1);
    --layout-control-active: rgba(239, 243, 244, 0.15);
    --layout-popover-bg: #000000;
    --layout-popover-border: #2f3336;
    --layout-popover-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.85);
  }

  .client-page-content {
    min-width: 0;
    width: 100%;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    background: var(--paper, var(--layout-bg));
  }

  /* Canonical Client Sidebar - authoritative client-home specification (260px) */
  .client-app-layout > .sidebar {
    width: 260px;
    flex-shrink: 0;
    background: var(--paper, var(--layout-bg));
    border: none;
    border-right: 1px solid var(--line, var(--layout-line));
    border-radius: 0;
    box-shadow: none;
    margin: 0;
    padding: 0.75rem 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100vh;
    overflow-y: auto;
    scrollbar-width: none;
    box-sizing: border-box;
    z-index: 10;
  }
  .client-app-layout > .sidebar::-webkit-scrollbar { display: none; }

  .client-app-layout .logo {
    font-family: var(--font-brand, 'Fraunces', Georgia, serif);
    font-weight: 900;
    font-size: 1.5rem;
    display: flex;
    align-items: baseline;
    padding: .35rem .6rem;
    margin-bottom: .2rem;
    text-decoration: none;
  }
  .client-app-layout .logo .va { color: var(--red, #C41E3A); }
  .client-app-layout .logo .room { color: var(--ink, var(--layout-ink)); }

  .client-app-layout .nav-group { display: flex; flex-direction: column; gap: .35rem; }
  .client-app-layout .nav-group + .nav-group { border-top: 1px solid var(--line, var(--layout-line)); padding-top: .75rem; margin-top: .15rem; }
  .client-app-layout .nav-label { margin: 0; font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, var(--layout-muted)); padding: .25rem .75rem .1rem; }

  .client-app-layout .nav-item {
    position: relative; display: flex; align-items: center; gap: 1rem;
    padding: .65rem .95rem; border-radius: 9999px;
    font-size: 1rem; font-weight: 500; color: var(--ink, var(--layout-ink));
    cursor: pointer; transition: background .15s ease, color .15s ease;
    text-decoration: none; border: none; background: transparent; width: 100%; box-sizing: border-box; text-align: left;
    font-family: inherit;
  }
  .client-app-layout .nav-item:hover { background: var(--control-hover, var(--layout-control-hover)); }
  .client-app-layout .nav-item.active {
    background: var(--control-active, var(--layout-control-active)) !important;
    color: var(--ink, var(--layout-ink)) !important;
    font-weight: 700 !important;
    border: none !important;
  }
  .client-app-layout .nav-item.active svg {
    color: var(--ink, var(--layout-ink)) !important;
  }
  .client-app-layout .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }

  .client-app-layout .notif-nav-badge {
    position: absolute; top: 50%; right: .75rem; min-width: 18px; height: 18px;
    padding: 0 5px; border-radius: 999px; background: var(--red, #C41E3A); color: #fff;
    transform: translateY(-50%);
    display: flex; align-items: center; justify-content: center; font-size: .65rem; font-weight: 700; line-height: 1;
  }
  .client-app-layout .nav-item.active .notif-nav-badge {
    background: var(--nav-badge-bg, var(--layout-control-active)) !important;
    color: var(--nav-badge-color, var(--ink, var(--layout-ink))) !important;
  }

  /* Account menu popover */
  .client-app-layout .account-menu {
    position: fixed;
    z-index: 99999;
    background: var(--layout-popover-bg);
    color: var(--layout-ink);
    border-radius: 16px;
    border: 1px solid var(--layout-popover-border);
    box-shadow: var(--layout-popover-shadow);
    padding: .6rem .5rem .5rem;
    display: flex; flex-direction: column; gap: 0;
  }
  .client-app-layout .account-menu[hidden] { display: none; }

  .client-app-layout .account-menu-list { display: flex; flex-direction: column; gap: 0; padding: 0 0 .15rem; }
  .client-app-layout .account-menu-row {
    display: flex; align-items: center; gap: .75rem;
    width: 100%; padding: .65rem .65rem;
    border-radius: 12px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; text-align: left;
    color: var(--layout-ink);
  }
  .client-app-layout .account-menu-row:hover { background: var(--layout-control-hover); }
  .client-app-layout .account-menu-row.active { cursor: default; }
  .client-app-layout .account-menu-row-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--layout-control-active); color: var(--layout-ink);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .9rem;
    flex-shrink: 0; overflow: hidden;
  }
  .client-app-layout .account-menu-row-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .client-app-layout .account-menu-row-info { display: flex; flex-direction: column; gap: .06rem; min-width: 0; flex: 1; }
  .client-app-layout .account-menu-row-name { font-size: .88rem; font-weight: 700; color: var(--layout-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-app-layout .account-menu-row-username { font-size: .76rem; color: var(--layout-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-app-layout .account-menu-row-check { flex-shrink: 0; margin-left: auto; width: 22px; height: 22px; border-radius: 50%; background: #00BA7C; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 900; }

  .client-app-layout .account-menu-divider { height: 1px; background: var(--layout-line); margin: .35rem .15rem; }
  .client-app-layout .account-menu-action {
    display: flex; align-items: center; width: 100%;
    padding: .7rem .75rem;
    border-radius: 10px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: .88rem; font-weight: 600;
    text-align: left; color: var(--layout-ink); text-decoration: none;
    box-sizing: border-box;
  }
  .client-app-layout .account-menu-action:hover { background: var(--layout-control-hover); }
  .client-app-layout .account-menu-action.active { background: var(--layout-control-active); }
  .client-app-layout .account-menu-action.disabled { color: var(--layout-muted); opacity: .55; cursor: default; pointer-events: none; }
  .client-app-layout .account-menu-logout { color: var(--layout-muted); }
  .client-app-layout .account-menu-logout:hover { color: var(--red, #C41E3A); background: var(--layout-control-hover); }

  /* Account identity button */
  .client-app-layout .account-identity {
    margin-top: auto;
    display: flex; align-items: center; gap: .75rem;
    width: 100%; padding: .65rem .75rem;
    border-radius: 9999px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; text-align: left;
    color: var(--layout-ink);
    flex-shrink: 0;
    position: relative;
    transition: background .15s ease;
  }
  .client-app-layout .account-identity:hover { background: var(--layout-control-hover); }
  .client-app-layout .account-identity-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--layout-control-active);
    color: var(--layout-ink);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .95rem;
    flex-shrink: 0; overflow: hidden;
  }
  .client-app-layout .account-identity-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .client-app-layout .account-identity-info { display: flex; flex-direction: column; gap: .05rem; min-width: 0; flex: 1; }
  .client-app-layout .account-identity-name { font-size: .92rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--layout-ink); }
  .client-app-layout .account-identity-username { font-size: .8rem; color: var(--layout-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-app-layout .account-identity-dots { flex-shrink: 0; color: var(--layout-muted); margin-left: auto; }
  .client-app-layout .account-identity:hover .account-identity-dots { color: var(--layout-ink); }

  /* Mobile styles & drawer */
  .sidebar-backdrop { display: none; position: fixed; inset: 0; background: rgba(26, 18, 16, .45); z-index: 190; }
  .sidebar-backdrop.show { display: block; }

  @media (max-width: 860px) {
    .client-app-layout { grid-template-columns: 1fr; height: auto; min-height: 100vh; overflow-y: visible; }
    .client-page-content { height: auto; overflow: visible; }
    .client-app-layout > .sidebar {
      position: fixed; inset: 0 auto 0 0; width: 80vw; max-width: 360px; height: 100vh; margin: 0;
      background: var(--paper, var(--layout-bg)); border-radius: 0; z-index: 200;
      transform: translateX(-100%); transition: transform .25s ease;
      box-shadow: 0 0 40px rgba(26, 18, 16, .25);
    }
    .client-app-layout > .sidebar.mobile-open { transform: translateX(0); }
  }

  .client-app-layout .nav-item svg,
  .client-app-layout .account-identity svg {
    pointer-events: none;
  }

  /* ---------- Content isolation and duplicate sidebar suppression ---------- */
  .client-layout-active .client-page-content aside.sidebar,
  .client-layout-active .client-page-content aside.profile-sidebar,
  .client-layout-active .client-page-content aside.host-profile-sidebar,
  .client-layout-active .client-page-content #sidebar,
  .client-layout-active .client-page-content #sidebar-client,
  .client-layout-active .client-page-content #sidebar-host,
  .client-layout-active .client-page-content #sidebar-shell,
  .client-layout-active .client-page-content .skeleton-sidebar {
    display: none !important;
  }

  /* Make legacy client page shells fill 100% of the content width */
  .client-layout-active .client-page-content .app-shell,
  .client-layout-active .client-page-content .app-layout,
  .client-layout-active .client-page-content .profile-layout,
  .client-layout-active .client-page-content .profile-desktop-shell,
  .client-layout-active .client-page-content .host-profile-shell {
    display: block !important;
    width: 100% !important;
    min-height: 100% !important;
    grid-template-columns: none !important;
  }

  .client-layout-active .client-page-content .main-col,
  .client-layout-active .client-page-content .profile-main-col,
  .client-layout-active .client-page-content .skeleton-main,
  .client-layout-active .client-page-content .host-profile-main {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
  }
`;

// While the account role is still resolving, the shell's wrappers take no
// space, so the page renders exactly as it did without a layout.
export const PENDING_SHELL_STYLES = `
  .app-shell-pending,
  .app-shell-pending > .app-shell-pending-content {
    display: contents;
  }
`;

// The React mobile navigation, ported from public/js/varoom-mobile-nav.js.
// When it is shown, legacy pages' own bottom bars are hidden, as the script did.
export const MOBILE_NAV_STYLES = `
  .varoom-mobile-nav{display:none;}
  body.has-varoom-mobile-nav .bottom-bar,
  body.has-varoom-mobile-nav .mobile-bottom-nav{display:none !important;}
  @media (max-width:860px){
    body.has-varoom-mobile-nav{padding-bottom:5.1rem;}
    body.chat-page-context .varoom-mobile-nav{display:none;}
    body.has-varoom-mobile-nav.chat-page-context{padding-bottom:0;}
    .varoom-mobile-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;position:fixed;bottom:0;left:50%;width:min(100% - 1rem,32rem);transform:translateX(-50%);z-index:150;min-height:3.7rem;padding:.3rem .35rem calc(.3rem + env(safe-area-inset-bottom));margin-bottom:max(.45rem,env(safe-area-inset-bottom));background:var(--white,var(--card-bg,#fff));border:1px solid var(--line-soft,var(--card-border,#ddd));border-radius:999px;box-shadow:0 10px 28px rgba(26,18,16,.14);transition:transform 220ms ease;}
    .varoom-mobile-nav.is-scroll-hidden{transform:translateX(-50%) translateY(110%);}
    .varoom-mobile-nav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.18rem;min-width:0;min-height:2.85rem;padding:.35rem .2rem;border-radius:999px;color:var(--ink,var(--muted,#666));font-size:.62rem;font-weight:600;line-height:1;white-space:nowrap;text-decoration:none;}
    .varoom-mobile-nav a.active{background:var(--nav-active-bg,var(--paper,#E9E7E2));color:var(--ink,#24211E);font-weight:700;}
    .varoom-mobile-nav svg{width:1.05rem;height:1.05rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;}
    .varoom-mobile-nav a:focus-visible{outline:2px solid var(--red,#c41e3a);outline-offset:-2px;}
  }
  @media (prefers-reduced-motion:reduce){.varoom-mobile-nav{transition:none;}}
`;
