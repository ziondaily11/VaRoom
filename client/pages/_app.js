import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useLayoutEffect } from 'react';
import HostLayout from '../components/HostLayout';
import ClientLayout from '../components/ClientLayout';
import AddAccountModal from '../components/AddAccountModal';
import '../styles/admin.css';
import '../legacy-pages/privacy.css';

const designTokensStyle = `
  :root {
    --color-bg: #f7f3ec;
    --color-surface: #fffdfb;
    --color-surface-muted: #f4efe9;
    --color-text: #181513;
    --color-text-muted: #594f47;
    --color-text-inverse: #f8f6f1;
    --color-border: rgba(24, 21, 19, 0.14);
    --color-border-strong: rgba(24, 21, 19, 0.25);
    --color-primary: #bd2337;
    --color-primary-hover: #a5202d;
    --color-cta-primary: #111111;
    --color-cta-primary-hover: #292929;
    --color-cta-secondary-border: #b8b2a7;
    --color-danger: #b42318;
    --color-success: #1a7a59;
    --color-warning: #b75d00;

    --font-body: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif;
    --font-heading: Georgia, 'Times New Roman', serif;
    --font-size-xs: 0.75rem;
    --font-size-sm: 0.875rem;
    --font-size-md: 1rem;
    --font-size-lg: 1.125rem;
    --font-size-xl: 1.5rem;
    --font-size-2xl: 2rem;
    --font-size-3xl: 2.75rem;

    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.25rem;
    --space-6: 1.5rem;
    --space-8: 2rem;
    --space-10: 2.5rem;
    --space-12: 3rem;
    --space-16: 4rem;

    --radius-sm: 0.5rem;
    --radius-md: 0.75rem;
    --radius-lg: 1rem;
    --radius-xl: 1.5rem;
    --radius-full: 9999px;
    --radius-cta: 4px;

    --shadow-sm: 0 1px 2px rgba(24, 21, 19, 0.06), 0 0 0 1px rgba(24, 21, 19, 0.04);
    --shadow-md: 0 12px 28px rgba(24, 21, 19, 0.12);
    --shadow-lg: 0 24px 56px rgba(24, 21, 19, 0.18);

    --content-max-width: 1200px;
    --page-padding: clamp(1rem, 2.4vw, 2rem);
    --control-height-sm: 2.25rem;
    --control-height-md: 3rem;
    --control-height-lg: 3.5rem;

    --transition-fast: 150ms ease;
    --transition-base: 220ms ease;
    --varoom-font-scale: 1;
    --varoom-type-xs: 0.75rem;
    --varoom-type-sm: 0.875rem;
    --varoom-type-body: 1rem;
    --varoom-type-lg: 1.125rem;
    --varoom-type-xl: 1.5rem;
  }

  html {
    font-size: calc(100% * var(--varoom-font-scale));
    transition: font-size 120ms ease;
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--varoom-type-body);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html, body, #__next {
    min-height: 100%;
  }

  html, body {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  a, button, input, select, textarea {
    font: inherit;
  }

  .auth-control {
    display: block;
    width: 100%;
    height: 52px !important;
    min-height: 52px !important;
    padding: 0 var(--space-4) 0 44px !important;
    border-radius: 10px !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    background: #0f0d0d !important;
    color: #f5efec !important;
    box-shadow: none;
    transition: border-color var(--transition-base), box-shadow var(--transition-base), background-color var(--transition-base);
  }

  .auth-control::placeholder {
    color: rgba(245, 239, 236, 0.58) !important;
    opacity: 0.8;
  }

  .auth-control:focus {
    border-color: rgba(221, 227, 214, 0.45) !important;
    outline: none;
  }

  .auth-control:focus-visible {
    outline: none;
    box-shadow: none;
  }

  .auth-control[aria-invalid='true'] {
    border-color: #efb6ae !important;
  }

  .auth-control--trailing-icon {
    padding-right: 44px !important;
  }

  .auth-consent-checkbox {
    appearance: auto !important;
    display: block;
    width: 16px !important;
    height: 16px !important;
    min-height: 16px !important;
    flex: 0 0 16px;
    margin: 2px 0 0 !important;
    padding: 0 !important;
    border-radius: 3px !important;
    accent-color: #f0e5d9;
  }

  .auth-consent {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    line-height: 1.5;
  }

  .auth-consent-copy {
    display: block;
    min-width: 0;
  }

  button:focus-visible,
  .landing-cta:focus-visible,
  .va-button:focus-visible,
  a:focus-visible {
    outline: 2px solid rgba(189, 35, 55, 0.38);
    outline-offset: 2px;
  }

  /* Landing page CTA buttons — strictly preserve vintage editorial styling */
  .landing-cta,
  .landing-cta-secondary {
    align-items: center;
    border-radius: var(--radius-cta) !important;
    cursor: pointer;
    display: inline-flex;
    font-weight: 600;
    justify-content: center;
    min-height: 44px;
    padding-bottom: 0 !important;
    padding-top: 0 !important;
    text-decoration: none;
    transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
  }

  .landing-cta:not(.landing-cta-secondary),
  .landing-cta-primary {
    background: #111111 !important;
    border: 1px solid #111111 !important;
    box-shadow: none !important;
    color: #ffffff !important;
  }

  .landing-cta-secondary {
    background: transparent !important;
    border: 1px solid #b8b2a7 !important;
    box-shadow: none !important;
    color: #171717 !important;
  }

  .landing-cta:not(.landing-cta-secondary):hover:not(:disabled):not([aria-disabled='true']),
  .landing-cta-primary:hover:not(:disabled):not([aria-disabled='true']) {
    background: #292929 !important;
    border-color: #292929 !important;
    color: #ffffff !important;
  }

  .landing-cta-secondary:hover:not(:disabled):not([aria-disabled='true']) {
    background: #f3f1ed !important;
    color: #171717 !important;
  }

  /* Platform UI action buttons */
  .va-button {
    align-items: center;
    border-radius: var(--radius-cta) !important;
    cursor: pointer;
    display: inline-flex;
    font-weight: 600;
    justify-content: center;
    min-height: 44px;
    padding-bottom: 0 !important;
    padding-top: 0 !important;
    text-decoration: none;
    transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
  }

  .va-button-primary,
  .va-button[data-variant='primary'] {
    background: #111111 !important;
    border: 1px solid #111111 !important;
    box-shadow: none !important;
    color: #ffffff !important;
  }

  .va-button-secondary,
  .va-button[data-variant='secondary'] {
    background: transparent !important;
    border: 1px solid var(--color-cta-secondary-border) !important;
    box-shadow: none !important;
    color: #171717 !important;
  }

  .va-button-primary:hover:not(:disabled):not([aria-disabled='true']),
  .va-button[data-variant='primary']:hover:not(:disabled):not([aria-disabled='true']) {
    background: #292929 !important;
    border-color: #292929 !important;
    color: #ffffff !important;
  }

  .va-button-secondary:hover:not(:disabled):not([aria-disabled='true']),
  .va-button[data-variant='secondary']:hover:not(:disabled):not([aria-disabled='true']) {
    background: #f3f1ed !important;
    color: #171717 !important;
  }

  /* Global dark-mode button high contrast overrides */
  html[data-theme="dark"] .va-button-primary,
  html[data-theme="dark"] .va-button[data-variant='primary'] {
    background: #EFF3F4 !important;
    border: 1px solid #EFF3F4 !important;
    color: #0F1419 !important;
  }

  html[data-theme="dark"] .va-button-primary:hover:not(:disabled):not([aria-disabled='true']),
  html[data-theme="dark"] .va-button[data-variant='primary']:hover:not(:disabled):not([aria-disabled='true']) {
    background: #D7DBDC !important;
    border-color: #D7DBDC !important;
    color: #0F1419 !important;
  }

  html[data-theme="dark"] .va-button-secondary,
  html[data-theme="dark"] .va-button[data-variant='secondary'] {
    background: transparent !important;
    border: 1px solid rgba(255, 255, 255, 0.22) !important;
    color: #E7E9EA !important;
  }

  html[data-theme="dark"] .va-button-secondary:hover:not(:disabled):not([aria-disabled='true']),
  html[data-theme="dark"] .va-button[data-variant='secondary']:hover:not(:disabled):not([aria-disabled='true']) {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #FFFFFF !important;
  }

  .va-button:focus-visible,
  .landing-cta:focus-visible,
  .landing-cta-secondary:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .va-button--large,
  .landing-cta-large {
    min-height: 50px;
  }

  .va-button--compact,
  .landing-cta-compact {
    min-height: 40px;
  }

  .va-button:disabled,
  .landing-cta:disabled,
  .landing-cta-secondary:disabled,
  .va-button[aria-disabled='true'],
  .landing-cta[aria-disabled='true'],
  .landing-cta-secondary[aria-disabled='true'] {
    cursor: not-allowed !important;
    opacity: 0.55 !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .va-button,
    .landing-cta,
    .landing-cta-secondary {
      transition: none;
    }
  }

  html[data-theme="dark"] {
    --color-bg: #000000;
    --color-surface: #000000;
    --color-surface-muted: #000000;
    --color-text: #E7E9EA;
    --color-text-muted: #71767b;
    --color-text-inverse: #000000;
    --color-border: rgba(255, 255, 255, 0.12);
    --color-border-strong: rgba(255, 255, 255, 0.22);
    --color-primary: #e0425e;
    --color-primary-hover: #ff6b81;
    --color-cta-primary: #EFF3F4;
    --color-cta-primary-hover: #D7DBDC;
    --color-cta-secondary-border: rgba(255, 255, 255, 0.22);
    --color-danger: #ff7186;
    --color-success: #4cc38a;
    --color-warning: #e0a23b;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.7);
    --shadow-lg: 0 24px 56px rgba(0, 0, 0, 0.85);
  }

  html[data-theme="dark"], html[data-theme="dark"] body, html[data-theme="dark"] #__next {
    background: #000000;
  }
`;

const fontSizeScript = `
  (function () {
    try {
      var isLanding = window.location.pathname === '/' || window.location.pathname === '';
      if (!isLanding) {
        var savedTheme = localStorage.getItem('varoom_theme') || 'system';
        var resolvedTheme = savedTheme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : savedTheme;
        document.documentElement.setAttribute('data-theme', resolvedTheme);
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
      var scales = { small: '0.9', default: '1', large: '1.1', xlarge: '1.2' };
      var choice = localStorage.getItem('varoom_font_size') || 'default';
      document.documentElement.style.setProperty('--varoom-font-scale', scales[choice] || scales.default);
      document.documentElement.setAttribute('data-font-size', scales[choice] ? choice : 'default');
    } catch (error) {
      document.documentElement.style.setProperty('--varoom-font-scale', '1');
      document.documentElement.setAttribute('data-font-size', 'default');
    }
  })();
`;

if (typeof window !== 'undefined' && typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Safely ignored removeChild on detached node:', child);
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Safely ignored insertBefore on detached reference node:', referenceNode);
      }
      return newNode;
    }
    return originalInsertBefore.apply(this, arguments);
  };
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [role, setRole] = useState('host');

  useEffect(() => {
    const applyThemeForRoute = (url) => {
      const targetPath = typeof url === 'string' ? url : router.pathname || '';
      const isLanding = targetPath === '/' || targetPath === '';
      if (isLanding) {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
        return;
      }
      try {
        const savedTheme = localStorage.getItem('varoom_theme') || 'system';
        const resolvedTheme = savedTheme === 'system'
          ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : savedTheme;
        document.documentElement.setAttribute('data-theme', resolvedTheme);
        document.documentElement.style.colorScheme = resolvedTheme;
      } catch (e) {}
    };

    applyThemeForRoute(router.asPath || router.pathname);
    router.events.on('routeChangeComplete', applyThemeForRoute);
    return () => {
      router.events.off('routeChangeComplete', applyThemeForRoute);
    };
  }, [router]);

  useIsomorphicLayoutEffect(() => {
    const updateRole = () => {
      try {
        const docRole = document.documentElement.getAttribute('data-account-role');
        if (docRole === 'client' || docRole === 'host') {
          setRole(docRole);
          return;
        }
        const cached = localStorage.getItem('varoom_cached_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.role === 'client' || parsed.role === 'host')) {
            setRole(parsed.role);
            return;
          }
        }
        const r = sessionStorage.getItem('varoom_user_role') || localStorage.getItem('varoom_last_role');
        if (r === 'client' || r === 'host') {
          setRole(r);
          return;
        }
      } catch (e) {}
    };

    updateRole();

    // Observe data-account-role attribute changes on documentElement
    let observer = null;
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        const docRole = document.documentElement.getAttribute('data-account-role');
        if (docRole === 'client' || docRole === 'host') {
          setRole(docRole);
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-account-role'] });
    }

    const handleRoleEvent = (e) => {
      if (e.detail?.role) {
        setRole(e.detail.role);
      } else {
        updateRole();
      }
    };

    window.addEventListener('storage', updateRole);
    window.addEventListener('varoom_role_change', handleRoleEvent);

    // If supabaseClient is available, verify authoritative profile role
    if (typeof window !== 'undefined' && window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.getSession().then(({ data }) => {
        const userId = data?.session?.user?.id;
        if (userId) {
          window.supabaseClient.from('profiles').select('role').eq('id', userId).maybeSingle().then(({ data: p }) => {
            if (p?.role) {
              try {
                sessionStorage.setItem('varoom_user_role', p.role);
                localStorage.setItem('varoom_last_role', p.role);
              } catch (e) {}
              setRole(p.role);
            }
          });
        }
      });
    }

    return () => {
      window.removeEventListener('storage', updateRole);
      window.removeEventListener('varoom_role_change', handleRoleEvent);
      if (observer) observer.disconnect();
    };
  }, []);

  const path = router.pathname || '';
  const asPath = router.asPath || '';
  const isHostHome = path === '/host-home' || asPath.startsWith('/host-home');
  const isAnalytics = path === '/analytics' || asPath.startsWith('/analytics');
  const isClientHome = path === '/client-home' || asPath.startsWith('/client-home');

  const isHostProfileRoute = path.startsWith('/host/') || asPath.startsWith('/host/');
  // Explicit host routes that must always use HostLayout (analytics retains its own layout)
  const isHostRoute = !isAnalytics && (isHostHome || (isHostProfileRoute && role !== 'client'));

  // Shared routes that use HostLayout unless user explicitly switched to client role
  const isSharedRoute = [
    '/bookings',
    '/notifications',
    '/profile',
    '/settings'
  ].some((r) => path.startsWith(r) || asPath.startsWith(r));

  // Determine whether this page should use the persistent HostLayout
  const isHostMode = !isClientHome && (isHostRoute || (isSharedRoute && role !== 'client'));

  // Client routes that use the persistent ClientLayout
  const isClientSharedRoute = isSharedRoute && role === 'client';
  const isClientHostProfile = isHostProfileRoute && role === 'client';
  const isClientMode = !isHostMode && (isClientHome || isClientSharedRoute || isClientHostProfile);

  const pageElement = <Component {...pageProps} />;

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/favicon-180.png" />
        <link rel="stylesheet" href="/js/varoom-dark-theme.css" />
        <style dangerouslySetInnerHTML={{ __html: designTokensStyle }} />
        <script dangerouslySetInnerHTML={{ __html: fontSizeScript }} />
      </Head>
      {Component.getLayout ? (
        Component.getLayout(pageElement)
      ) : isHostMode ? (
        <HostLayout>{pageElement}</HostLayout>
      ) : isClientMode ? (
        <ClientLayout>{pageElement}</ClientLayout>
      ) : (
        pageElement
      )}
      <AddAccountModal />
    </>
  );
}
