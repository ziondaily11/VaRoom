import Head from 'next/head';
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

  button,
  [type='button'],
  [type='submit'],
  [type='reset'],
  .landing-cta,
  .va-button {
    min-height: var(--control-height-md) !important;
    border-radius: var(--radius-full) !important;
    border: 1px solid transparent;
    padding: 0 var(--space-4) !important;
    transition: background-color var(--transition-base), border-color var(--transition-base), color var(--transition-base), transform var(--transition-fast), box-shadow var(--transition-base);
    cursor: pointer;
  }

  input, textarea, select {
    width: 100%;
    min-height: var(--control-height-md) !important;
    padding: 0 var(--space-4) !important;
    border-radius: var(--radius-md) !important;
    border: 1px solid var(--color-border) !important;
    background: var(--color-surface) !important;
    color: var(--color-text) !important;
    box-shadow: none !important;
    transition: border-color var(--transition-base), box-shadow var(--transition-base), background-color var(--transition-base);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--color-text-muted) !important;
    opacity: 0.8;
  }

  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  button:focus-visible,
  .landing-cta:focus-visible,
  .va-button:focus-visible,
  a:focus-visible {
    outline: 2px solid rgba(189, 35, 55, 0.38);
    outline-offset: 2px;
  }

  .va-button-primary,
  .landing-cta,
  .va-button[data-variant='primary'] {
    background: var(--color-primary) !important;
    color: var(--color-text-inverse) !important;
    box-shadow: var(--shadow-sm);
  }

  .va-button-primary:hover,
  .landing-cta:hover,
  .va-button[data-variant='primary']:hover {
    background: var(--color-primary-hover) !important;
  }

  .va-button-secondary,
  .va-button[data-variant='secondary'] {
    background: var(--color-surface) !important;
    color: var(--color-text) !important;
    border-color: var(--color-border) !important;
  }

  html[data-theme="dark"], html[data-theme="dark"] body, html[data-theme="dark"] #__next {
    background: #15100F;
  }
`;

const fontSizeScript = `
  (function () {
    try {
      var savedTheme = localStorage.getItem('varoom_theme') || 'system';
      var resolvedTheme = savedTheme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : savedTheme;
      document.documentElement.setAttribute('data-theme', resolvedTheme);
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

export default function App({ Component, pageProps }) {
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
      <Component {...pageProps} />
    </>
  );
}
