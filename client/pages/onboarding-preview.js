/**
 * /onboarding-preview
 *
 * Isolated development preview of the onboarding screen.
 * Reads the real onboarding.html, injects a mock supabaseClient so the
 * auth-gate never fires, and renders the page with no surrounding app chrome.
 *
 * DO NOT ship this route to production users. It is a dev-only helper.
 * The real onboarding flow (/onboarding) is completely untouched by this file.
 */

import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect, useRef } from 'react';

// ── Parse the legacy HTML file exactly as [...slug].js does ──────────────────

const TEMPLATE_DIR = path.join(process.cwd(), 'legacy-pages');

function parseTemplate(source) {
  const title = (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || 'Onboarding Preview';
  const head  = (source.match(/<head[^>]*>([\s\S]*?)<\/head>/i)  || [])[1] || '';
  const body  = (source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)  || [])[1] || source;
  const scripts = [];
  const strip = (markup) =>
    markup.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_, attrs, content) => {
      scripts.push({ attributes: attrs, content });
      return '';
    });
  return {
    title: title.replace(/<[^>]+>/g, ''),
    markup: strip(head) + strip(body),
    scripts,
  };
}

// ── Mock supabaseClient ───────────────────────────────────────────────────────
// Injected right after js/supabase-client.js loads so it overwrites the real
// client before the onboarding IIFE runs. Role is set to 'client' to keep the
// step count simple and avoid the host-niches API call.

const MOCK_SCRIPT_CONTENT = /* js */ `
(function () {
  var MOCK_USER    = { id: 'preview-00000000-0000-0000-0000-000000000001' };
  var MOCK_SESSION = { user: MOCK_USER, access_token: 'preview-token' };
  var MOCK_PROFILE = {
    role: 'client',
    username: 'preview_user',
    onboarding_completed: false
  };

  window.supabaseClient = {
    auth: {
      getSession: function () {
        return Promise.resolve({ data: { session: MOCK_SESSION }, error: null });
      }
    },

    from: function (table) {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                maybeSingle: function () {
                  return Promise.resolve({ data: MOCK_PROFILE, error: null });
                }
              };
            }
          };
        },
        update: function () {
          return {
            eq: function () {
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    },

    storage: {
      from: function () {
        return {
          upload: function (filePath) {
            // Simulate a successful upload; return the same path the real
            // bucket would return so avatar_url is saved correctly in answers.
            return Promise.resolve({ data: { path: filePath }, error: null });
          }
        };
      }
    },

    rpc: function () {
      return Promise.resolve({ data: null, error: null });
    }
  };

  window.VaRoomMedia = window.VaRoomMedia || {};
  window.VaRoomMedia.upload = function () {
    return Promise.resolve({ objectKey: 'avatars/preview/preview-avatar.jpg' });
  };

  console.log('[onboarding-preview] Mock supabaseClient active.');
})();
`;

// ── Script runner (same logic as runLegacyScripts in [...slug].js) ───────────

async function runScripts(container, scripts) {
  // Ensure Supabase CDN global is available (needed by supabase-client.js)
  if (scripts.some(({ attributes }) => attributes.includes('@supabase/supabase-js'))) {
    await new Promise((resolve, reject) => {
      if (window.supabase) { resolve(); return; }

      const timeout = window.setTimeout(
        () => reject(new Error('[onboarding-preview] Supabase CDN timed out.')),
        10000
      );
      const finish = () => {
        window.clearTimeout(timeout);
        window.supabase ? resolve() : reject(new Error('[onboarding-preview] Supabase global missing.'));
      };
      const fail = () => { window.clearTimeout(timeout); reject(); };

      const existing = Array.from(document.scripts).find(
        (s) => s.src.includes('@supabase/supabase-js')
      );
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', fail, { once: true });
      } else {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.async = false;
        s.addEventListener('load', finish, { once: true });
        s.addEventListener('error', fail, { once: true });
        document.head.appendChild(s);
      }
    });
  }

  for (const { attributes, content } of scripts) {
    const script = document.createElement('script');
    const attrPattern = /([^\s=]+)(?:="([^"]*)")?/g;
    let m;
    while ((m = attrPattern.exec(attributes))) {
      if (m[1].toLowerCase() !== 'src') script.setAttribute(m[1], m[2] || '');
      else script.src = m[2];
    }
    if (script.src.includes('@supabase/supabase-js')) continue;
    script.async = false;
    script.text = content;

    if (script.src) {
      await new Promise((resolve) => {
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', resolve, { once: true });
        container.appendChild(script);
      });
    } else {
      container.appendChild(script);
    }
  }
}

// ── Static props: read + parse onboarding.html, splice in mock ───────────────

export async function getStaticProps() {
  const source = fs.readFileSync(
    path.join(TEMPLATE_DIR, 'onboarding.html'),
    'utf8'
  );
  const { title, markup, scripts } = parseTemplate(source);

  // Insert the mock immediately after js/supabase-client.js so it runs before
  // the onboarding IIFE but after the real client script (which we want to
  // overwrite rather than leave dangling).
  const clientIdx = scripts.findIndex(({ attributes }) =>
    attributes.includes('supabase-client.js')
  );
  const mockEntry = { attributes: '', content: MOCK_SCRIPT_CONTENT };
  if (clientIdx >= 0) {
    scripts.splice(clientIdx + 1, 0, mockEntry);
  } else {
    // supabase-client.js wasn't found as an extracted script tag; prepend mock
    scripts.unshift(mockEntry);
  }

  return { props: { title, markup, scripts } };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function OnboardingPreview({ title, markup, scripts }) {
  const containerRef = useRef(null);

  useEffect(() => {
    runScripts(containerRef.current, scripts).catch((err) =>
      console.error('[onboarding-preview] Script init error:', err)
    );
  // scripts is stable between renders; the effect must run exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head>
        <title>{title} — Preview</title>
        {/* <base href="/"> ensures relative asset paths (js/, favicon/) resolve correctly */}
        <base href="/" />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* Supabase CDN must be available before supabase-client.js tries to use it */}
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="beforeInteractive"
      />

      {/*
        dangerouslySetInnerHTML mirrors exactly what [...slug].js does for every
        other legacy page — no additional wrapper div so the onboarding body
        styles (display:flex, full-screen overlay) apply without interference.
      */}
      <main ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
