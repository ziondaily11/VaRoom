import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import SharedHostSidebar from './SharedHostSidebar';

const hostLayoutStyles = `
  /* ---------- Host Application Layout ---------- */
  .host-app-layout {
    display: grid;
    grid-template-columns: 295px minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: var(--paper, #15100F);
    color: var(--ink, #F5EFEC);
    font-family: var(--font-body, 'Helvetica Neue', Arial, sans-serif);
  }

  .host-page-content {
    min-width: 0;
    width: 100%;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    background: var(--paper, #15100F);
  }

  /* Canonical Sidebar - authoritative host-home specification */
  .host-app-layout > .sidebar {
    width: 295px;
    flex-shrink: 0;
    background: var(--paper, #15100F);
    border: none;
    border-right: 1px solid var(--line, rgba(255, 255, 255, 0.12));
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
  .host-app-layout .logo .room { color: var(--ink, #F5EFEC); }

  .host-app-layout .nav-group { display: flex; flex-direction: column; gap: .35rem; }
  .host-app-layout .nav-group + .nav-group { border-top: 1px solid var(--line, rgba(255, 255, 255, 0.12)); padding-top: .75rem; margin-top: .15rem; }
  .host-app-layout .nav-label { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, #B8ACA8); padding: .25rem .75rem .1rem; }

  .host-app-layout .nav-item {
    position: relative; display: flex; align-items: center; gap: 1rem;
    padding: .65rem .95rem; border-radius: 9999px;
    font-size: 1rem; font-weight: 500; color: var(--ink, #F5EFEC);
    cursor: pointer; transition: background .15s ease, color .15s ease;
    text-decoration: none; border: none; background: transparent; width: 100%; box-sizing: border-box; text-align: left;
    font-family: inherit;
  }
  .host-app-layout .nav-item:hover { background: var(--control-hover, rgba(255, 255, 255, 0.1)); }
  .host-app-layout .nav-item.active { background: var(--control-active, rgba(255, 255, 255, 0.16)); color: var(--ink, #F5EFEC); font-weight: 700; }
  .host-app-layout .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }

  .host-app-layout .notif-nav-badge {
    position: absolute; top: 50%; right: .75rem; min-width: 18px; height: 18px;
    padding: 0 5px; border-radius: 999px; background: var(--red, #C41E3A); color: #fff;
    transform: translateY(-50%);
    display: flex; align-items: center; justify-content: center; font-size: .65rem; font-weight: 700; line-height: 1;
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
    z-index: 400;
    background: var(--surface-card, #16181c);
    color: var(--ink, #F5EFEC);
    border-radius: 16px;
    border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
    box-shadow: 0 16px 48px -8px rgba(0,0,0,.65);
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
    color: var(--ink, #F5EFEC);
  }
  .host-app-layout .account-menu-row:hover { background: var(--control-hover, rgba(255, 255, 255, 0.1)); }
  .host-app-layout .account-menu-row.active { cursor: default; }
  .host-app-layout .account-menu-row-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--control-active, rgba(255, 255, 255, 0.16)); color: var(--ink, #F5EFEC);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .9rem;
    flex-shrink: 0; overflow: hidden;
  }
  .host-app-layout .account-menu-row-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .host-app-layout .account-menu-row-info { display: flex; flex-direction: column; gap: .06rem; min-width: 0; flex: 1; }
  .host-app-layout .account-menu-row-name { font-size: .88rem; font-weight: 700; color: var(--ink, #F5EFEC); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .host-app-layout .account-menu-row-username { font-size: .76rem; color: var(--muted, #B8ACA8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .host-app-layout .account-menu-row-check { flex-shrink: 0; margin-left: auto; width: 22px; height: 22px; border-radius: 50%; background: #00BA7C; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 900; }

  .host-app-layout .account-menu-divider { height: 1px; background: var(--line, rgba(255, 255, 255, 0.12)); margin: .35rem .15rem; }
  .host-app-layout .account-menu-action {
    display: block; width: 100%;
    padding: .7rem .75rem;
    border-radius: 10px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: .88rem; font-weight: 600;
    text-align: left; color: var(--ink, #F5EFEC); text-decoration: none;
    box-sizing: border-box;
  }
  .host-app-layout .account-menu-action:hover { background: var(--control-hover, rgba(255, 255, 255, 0.1)); }
  .host-app-layout .account-menu-action.active { background: var(--control-active, rgba(255, 255, 255, 0.16)); }
  .host-app-layout .account-menu-action.disabled { opacity: .45; cursor: default; pointer-events: none; }
  .host-app-layout .account-menu-logout { color: var(--muted, #B8ACA8); }
  .host-app-layout .account-menu-logout:hover { color: var(--red, #C41E3A); background: var(--control-hover, rgba(255, 255, 255, 0.1)); }

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
    color: var(--ink, #F5EFEC);
    flex-shrink: 0;
    position: relative;
    transition: background .15s ease;
  }
  .host-app-layout .account-identity:hover { background: var(--control-hover, rgba(255, 255, 255, 0.1)); }
  .host-app-layout .account-identity-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--control-active, rgba(255, 255, 255, 0.16));
    color: var(--ink, #F5EFEC);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .95rem;
    flex-shrink: 0; overflow: hidden;
  }
  .host-app-layout .account-identity-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .host-app-layout .account-identity-info { display: flex; flex-direction: column; gap: .05rem; min-width: 0; flex: 1; }
  .host-app-layout .account-identity-name { font-size: .92rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink, #F5EFEC); }
  .host-app-layout .account-identity-username { font-size: .8rem; color: var(--muted, #B8ACA8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .host-app-layout .account-identity-dots { flex-shrink: 0; color: var(--muted, #B8ACA8); margin-left: auto; }
  .host-app-layout .account-identity:hover .account-identity-dots { color: var(--ink, #F5EFEC); }

  /* Mobile styles & drawer */
  .sidebar-backdrop { display: none; position: fixed; inset: 0; background: rgba(26, 18, 16, .45); z-index: 190; }
  .sidebar-backdrop.show { display: block; }

  @media (max-width: 860px) {
    .host-app-layout { grid-template-columns: 1fr; height: auto; min-height: 100vh; overflow-y: visible; }
    .host-page-content { height: auto; overflow: visible; }
    .host-app-layout > .sidebar {
      position: fixed; inset: 0 auto 0 0; width: 80vw; max-width: 360px; height: 100vh; margin: 0;
      background: var(--paper, #15100F); border-radius: 0; z-index: 200;
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

  /* Make legacy host page shells fill 100% of the content width */
  .host-layout-active .host-page-content .app-shell,
  .host-layout-active .host-page-content .app-layout,
  .host-layout-active .host-page-content .profile-layout,
  .host-layout-active .host-page-content .profile-desktop-shell,
  .host-layout-active .host-page-content .skeleton-shell,
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

export default function HostLayout({ children, activeNav }) {
  const router = useRouter();

  // Intercept links inside legacy host page content to use client-side navigation
  useEffect(() => {
    const handleContentLinkClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Ignore external or specialized links
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

      // Check if destination is an internal route
      const internalRoutes = [
        '/host-home',
        '/bookings',
        '/chats',
        '/notifications',
        '/profile',
        '/settings',
        '/analytics',
        '/support',
        '/marketplace',
        '/list',
        '/host/'
      ];

      const isInternal = internalRoutes.some((route) => href.startsWith(route));
      if (isInternal) {
        e.preventDefault();
        router.push(href);
      }
    };

    document.addEventListener('click', handleContentLinkClick);
    return () => document.removeEventListener('click', handleContentLinkClick);
  }, [router]);

  return (
    <div className="host-app-layout host-layout-active">
      <style dangerouslySetInnerHTML={{ __html: hostLayoutStyles }} />
      <SharedHostSidebar activeNav={activeNav} />
      <div className="host-page-content" id="host-page-content">
        {children}
      </div>
    </div>
  );
}
