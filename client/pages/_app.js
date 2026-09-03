import Head from 'next/head';

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
  }
  body {
    font-size: var(--varoom-type-body);
  }
`;

const fontSizeScript = `
  (function () {
    try {
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
        <style dangerouslySetInnerHTML={{ __html: fontSizeStyle }} />
        <script dangerouslySetInnerHTML={{ __html: fontSizeScript }} />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
