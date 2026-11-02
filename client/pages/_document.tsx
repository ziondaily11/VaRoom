import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from 'next/document';
import Script from 'next/script';
const { chatsCssHref, chatsThemeCssHref } = require('../lib/chatsCssAssets');
import { themeBootScript as buildThemeBootScript } from '../lib/theme';

// This runs before React or a route's legacy markup is painted.  Keeping the
// resolved theme on <html> avoids the browser painting its default white page
// between navigations and during hydration. Generated from lib/theme.ts.
const themeBootScript = buildThemeBootScript();

type VaRoomDocumentProps = DocumentInitialProps & { isChatsRoute: boolean };

export default class VaRoomDocument extends Document<VaRoomDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<VaRoomDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);
    const requestPath = (ctx.req?.url || ctx.asPath || ctx.pathname || '').split('?')[0];
    return {
      ...initialProps,
      isChatsRoute: requestPath === '/chats' || requestPath === '/elie' ||
        ctx.pathname === '/chats' || ctx.pathname === '/elie',
    };
  }

  render() {
    const { isChatsRoute } = this.props;
    return (
      <Html lang="en" data-scroll-behavior="smooth">
        <Head>
          {/* Attach the legacy route styles in the initial document so the first
              Chats paint is styled before React's route head is hydrated. */}
          {isChatsRoute && <>
            <link rel="preload" href={chatsThemeCssHref} as="style" />
            <link rel="stylesheet" href={chatsThemeCssHref} />
            <link rel="preload" href={chatsCssHref} as="style" />
            <link rel="stylesheet" href={chatsCssHref} />
          </>}
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
