import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import SharedClientSidebar from './SharedClientSidebar';

const clientLayoutStyles = `
  /* ---------- Client Application Layout ---------- */
  .client-app-layout {
    --layout-bg: #FFFFFF;
    --layout-ink: #0F1419;
    --layout-muted: #536471;
    --layout-line: #EFF3F4;
    --layout-line-soft: #EFF3F4;
    --layout-control-hover: #F2F5F7;
    --layout-control-active: #E1E8ED;
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
  .client-app-layout .nav-label { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, var(--layout-muted)); padding: .25rem .75rem .1rem; }

  .client-app-layout .nav-item {
    position: relative; display: flex; align-items: center; gap: 1rem;
    padding: .65rem .95rem; border-radius: 9999px;
    font-size: 1rem; font-weight: 500; color: var(--ink, var(--layout-ink));
    cursor: pointer; transition: background .15s ease, color .15s ease;
    text-decoration: none; border: none; background: transparent; width: 100%; box-sizing: border-box; text-align: left;
    font-family: inherit;
  }
  .client-app-layout .nav-item:hover { background: var(--control-hover, var(--layout-control-hover)); }
  .client-app-layout .nav-item.active { background: var(--control-active, var(--layout-control-active)); color: var(--ink, var(--layout-ink)); font-weight: 700; }
  .client-app-layout .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }

  .client-app-layout .notif-nav-badge {
    position: absolute; top: 50%; right: .75rem; min-width: 18px; height: 18px;
    padding: 0 5px; border-radius: 999px; background: var(--red, #C41E3A); color: #fff;
    transform: translateY(-50%);
    display: flex; align-items: center; justify-content: center; font-size: .65rem; font-weight: 700; line-height: 1;
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

export default function ClientLayout({ children, activeNav }) {
  const router = useRouter();

  // Intercept links inside legacy client page content to use client-side navigation
  useEffect(() => {
    const handleContentLinkClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      if (
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#') ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return;
      }

      const internalRoutes = [
        '/client-home',
        '/bookings',
        '/chats',
        '/notifications',
        '/profile',
        '/settings',
        '/support',
        '/marketplace',
        '/signup-host',
        '/host/'
      ];

      const isInternal = internalRoutes.some((route) => href === route || href.startsWith(`${route}/`) || href.startsWith(`${route}?`));
      if (isInternal) {
        e.preventDefault();
        router.push(href);
      }
    };

    document.addEventListener('click', handleContentLinkClick);
    return () => document.removeEventListener('click', handleContentLinkClick);
  }, [router]);

  return (
    <>
      <style jsx global>{clientLayoutStyles}</style>
      <div className="client-app-layout client-layout-active">
        <SharedClientSidebar activeNav={activeNav} />
        <main className="client-page-content" id="client-main-content">
          {children}
        </main>
      </div>
    </>
  );
}
