import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

// This runs before React or a route's legacy markup is painted.  Keeping the
// resolved theme on <html> avoids the browser painting its default white page
// between navigations and during hydration.
const themeBootScript = `
  (function () {
    try {
      if (window.location.pathname === '/' || window.location.pathname === '') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
        return;
      }
      var saved = localStorage.getItem('varoom_theme') || 'system';
      var theme = saved === 'system'
        ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : saved;
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
      document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    } catch (error) {}
  })();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <style>{`html{background:#FFFFFF;color-scheme:light}html[data-theme="dark"]{background:#000000;color-scheme:dark}body{margin:0;background:#FFFFFF}html[data-theme="dark"] body{background:#000000}`}</style>
      </Head>
      <body>
        <Main />
        <NextScript />
        <Script src="/js/google-sign-in.js" strategy="beforeInteractive" />
      </body>
    </Html>
  );
}
