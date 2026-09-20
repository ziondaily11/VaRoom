import Head from 'next/head';
import '../styles/admin.css';

const fontSizeStyle = `
  :root {
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
  }
  body {
    font-size: var(--varoom-type-body);
  }
  html, body, #__next { min-height: 100%; background: #F7F6F3; }
  html[data-theme="dark"], html[data-theme="dark"] body, html[data-theme="dark"] #__next { background: #15100F; }
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
        <style dangerouslySetInnerHTML={{ __html: fontSizeStyle }} />
        <script dangerouslySetInnerHTML={{ __html: fontSizeScript }} />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
