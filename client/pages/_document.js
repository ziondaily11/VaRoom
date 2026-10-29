import Document, { Html, Head, Main, NextScript } from 'next/document';
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

export default class VaRoomDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    return {
      ...initialProps,
      isChatsRoute: ctx.pathname === '/chats' || ctx.pathname === '/elie',
    };
  }

  render() {
    const { isChatsRoute } = this.props;
    return (
      <Html lang="en">
        <Head>
          {/* Warm the route stylesheet for client-side navigation, and attach it
              in the initial document for a direct Chats load before React runs. */}
          <link rel="preload" href="/js/chats.css" as="style" />
          {isChatsRoute && <link rel="stylesheet" href="/js/chats.css" />}
          <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
          <style>{`html{background:#FFFFFF;color-scheme:light}html[data-theme="dark"]{background:#000000;color-scheme:dark}body{margin:0;background:#FFFFFF}html[data-theme="dark"] body{background:#000000}`}</style>
        </Head>
        <body>
          <Main />
          <NextScript />
          <Script src="/js/account-auth.js" strategy="beforeInteractive" />
          <Script src="/js/account-switcher.js" strategy="beforeInteractive" />
          <Script src="/js/google-sign-in.js" strategy="beforeInteractive" />
        </body>
      </Html>
    );
  }
}
