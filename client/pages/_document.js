import { Html, Head, Main, NextScript } from 'next/document';

// This runs before React or a route's legacy markup is painted.  Keeping the
// resolved theme on <html> avoids the browser painting its default white page
// between navigations and during hydration.
const themeBootScript = `
  (function () {
    try {
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
        <style>{`html{background:#F7F6F3;color-scheme:light}html[data-theme="dark"]{background:#15100F;color-scheme:dark}body{margin:0;background:#F7F6F3}html[data-theme="dark"] body{background:#15100F}`}</style>
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
