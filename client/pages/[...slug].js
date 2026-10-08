import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Script from 'next/script';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef } from 'react';
import ElieIcon from '../components/ElieIcon';
import ChatComposerActions from '../components/ChatComposerActions';
import ElieComposerBeam from '../components/ElieComposerBeam';
import { ThinkingOrb } from 'thinking-orbs';

const templateDirectory = path.join(process.cwd(), 'legacy-pages');
const routeAliases = {
  properties: 'list.html',
  'landing-page': 'landing page.html',
  'login.html': 'login.html',
  chat: 'chats.html'
};

function templateForSlug(slug) {
  if (!slug || slug.length === 0) return 'index.html';
  // Elie is a conversation type, not a separate application shell.  Keep the
  // old URL working for saved links, but render it through Chats.
  if (slug.join('/') === 'elie') return 'chats.html';
  return routeAliases[slug.join('/')] || `${slug.join('/')}.html`;
}

function styleStringToObject(style) {
  return style.split(';').reduce((result, declaration) => {
    const [property, value] = declaration.split(':');
    if (!property || !value) return result;
    const camelProperty = property.trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelProperty] = value.trim();
    return result;
  }, {});
}

function renderLegacyElieIcon(attributes) {
  const className = (attributes.match(/\bclass=["']([^"']*)["']/i) || [])[1] || '';
  const style = (attributes.match(/\bstyle=["']([^"']*)["']/i) || [])[1] || '';
  const alt = (attributes.match(/\b(?:alt|aria-label)=["']([^"']*)["']/i) || [])[1] || '';
  const size = className.includes('elie-logo-header')
    ? 34
    : className.includes('elie-logo-nav')
      ? 22
      : 34;

  return renderToStaticMarkup(
    React.createElement('span', {
      className,
      style: style ? styleStringToObject(style) : undefined,
      'aria-label': alt || 'Elie, AI assistant',
      'data-elie-bot-avatar': 'true',
      'data-avatar-size': String(size),
    })
  );
}

function replaceLegacyElieIcons(source) {
  const withIconMarkers = source.replace(
    /<span\b([^>]*?)\bdata-elie-icon\b([^>]*)><\/span>/gi,
    (_, beforeMarker, afterMarker) => renderLegacyElieIcon(`${beforeMarker} ${afterMarker}`)
  );

  return withIconMarkers.replace(
    /<svg\b([^>]*?)>\s*<circle cx="12" cy="12" r="8"\/>\s*<path d="M8 14c1\.2 1\.1 2\.5 1\.6 4 1\.6s2\.8-.5 4-1\.6M9 9h\.01M15 9h\.01"\/>\s*<\/svg>/g,
    () => renderLegacyElieIcon('class="elie-icon"')
  );
}

function markActiveElieNavigation(source, isEliePage) {
  if (!isEliePage) return source;

  return source.replace(/<a\b([^>]*\bhref=["']\/elie["'][^>]*)>/gi, (_, attributes) => {
    if (/\bclass=["'][^"']*\bactive\b[^"']*["']/i.test(attributes)) return `<a${attributes}>`;
    if (/\bclass=["'][^"']*["']/i.test(attributes)) {
      return `<a${attributes.replace(/\bclass=["']([^"']*)["']/i, 'class="$1 active"')}>`;
    }
    return `<a${attributes} class="active">`;
  });
}

function markElieComposer(source, isEliePage) {
  if (!isEliePage) return source;
  source = source.replace(/<div class="chat-col([^"]*)"/i, (match, rest) => {
    if (match.includes('is-elie')) return match;
    return `<div class="chat-col${rest} is-elie" data-conversation-type="elie"`;
  });
  source = source.replace(/<div class="chat-input-area([^"]*)"/i, (match, rest) => {
    if (match.includes('is-elie')) return match;
    return `<div class="chat-input-area${rest} is-elie" data-composer-mode="elie"`;
  });
  return source;
}

function parseTemplate(source, isEliePage) {
  source = markActiveElieNavigation(source, isEliePage);
  source = markElieComposer(source, isEliePage);
  source = replaceLegacyElieIcons(source);
  const title = (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || 'VaRoom';
  const head = (source.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
  const body = (source.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [])[1] || source;
  const scripts = [];
  const withoutScripts = (markup) => markup.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_, attributes, content) => {
    scripts.push({ attributes, content });
    return '';
  });

  const cleanHead = withoutScripts(head);
  const cleanBody = withoutScripts(body);
  return { title: title.replace(/<[^>]+>/g, ''), markup: `${cleanHead}${cleanBody}`, scripts };
}

export async function getStaticPaths() {
  const templates = fs.readdirSync(templateDirectory)
    .filter((file) => file.endsWith('.html') && file.replace(/\.html$/, '') !== 'privacy')
    .filter((file) => !['signup-client.html', 'signup-host.html', 'forgot-password.html'].includes(file));
  const paths = templates
    .filter((file) => file !== 'index.html' && file !== 'terms.html')
    .map((file) => ({
      params: { slug: [file.replace(/\.html$/, '').replace(/ /g, '-') ] }
    }));

  paths.push(
    { params: { slug: ['login.html'] } },
    { params: { slug: ['properties'] } },
    { params: { slug: ['chat'] } }
  );
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const slugKey = params && params.slug ? params.slug.join('/') : '';
  const isElieSlug = slugKey === 'elie' || slugKey === 'elie.html';
  const templateName = templateForSlug(params && params.slug);
  const source = fs.readFileSync(path.join(templateDirectory, templateName), 'utf8');
  return { props: { ...parseTemplate(source, templateName === 'elie.html' || isElieSlug) } };
}

async function runLegacyScripts(container, scripts) {
  if (!document.querySelector('script[data-varoom-data-cache]')) {
    await new Promise((resolve, reject) => {
      const cacheScript = document.createElement('script');
      cacheScript.src = '/js/varoom-data-cache.js';
      cacheScript.dataset.varoomDataCache = 'true';
      cacheScript.onload = resolve;
      cacheScript.onerror = reject;
      document.head.appendChild(cacheScript);
    });
  }

  const hasSidebarScript = scripts.some(({ attributes }) => attributes.includes('varoom-sidebar.js'));
  if (!window.VaroomSidebar && !hasSidebarScript) {
    await new Promise((resolve, reject) => {
      const sidebarScript = document.createElement('script');
      sidebarScript.src = '/js/varoom-sidebar.js';
      sidebarScript.dataset.varoomSidebar = 'true';
      sidebarScript.addEventListener('load', resolve, { once: true });
      sidebarScript.addEventListener('error', () => reject(new Error('Unable to load sidebar counts.')), { once: true });
      document.head.appendChild(sidebarScript);
    });
  }

  if (scripts.some(({ attributes }) => attributes.includes('@supabase/supabase-js'))) {
    await new Promise((resolve, reject) => {
      if (window.supabase) {
        resolve();
        return;
      }

      const timeout = window.setTimeout(() => {
        reject(new Error('Supabase did not finish loading before the legacy page initialized.'));
      }, 10000);
      const finish = () => {
        window.clearTimeout(timeout);
        if (window.supabase) resolve();
        else reject(new Error('Supabase loaded without its browser global.'));
      };
      const fail = () => {
        window.clearTimeout(timeout);
        reject(new Error('Unable to load Supabase for the legacy page.'));
      };
      const existing = Array.from(document.scripts).find((script) =>
        script.src.includes('@supabase/supabase-js')
      );

      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', fail, { once: true });
      } else {
        const supabaseScript = document.createElement('script');
        supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        supabaseScript.async = false;
        supabaseScript.addEventListener('load', finish, { once: true });
        supabaseScript.addEventListener('error', fail, { once: true });
        document.head.appendChild(supabaseScript);
      }
    });
  }

  for (const { attributes, content } of scripts) {
    const script = document.createElement('script');
    const attributePattern = /([^\s=]+)(?:="([^"]*)")?/g;
    let match;
    while ((match = attributePattern.exec(attributes))) {
      if (match[1].toLowerCase() !== 'src') script.setAttribute(match[1], match[2] || '');
      else script.src = match[2];
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
  if (window.VaroomSidebar && window.VaroomSidebar.initCounts) {
    await window.VaroomSidebar.initCounts();
  }
}

export default function LegacyPage({ title, markup, scripts }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let composerActionsRoot;
    let elieComposerBeamRoot;
    const avatarRoots = new Map();
    const orbRoots = new Map();
    const mountAvatars = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      const avatars = [];
      if (node.matches('[data-elie-bot-avatar]')) avatars.push(node);
      avatars.push(...node.querySelectorAll('[data-elie-bot-avatar]'));

      avatars.forEach((avatar) => {
        if (avatarRoots.has(avatar)) return;
        const root = createRoot(avatar);
        avatarRoots.set(avatar, root);
        root.render(
          React.createElement(ElieIcon, {
            size: Number(avatar.getAttribute('data-avatar-size')) || 24,
            className: 'elie-icon',
            type: avatar.getAttribute('data-avatar-type') || 'drop',
            state: avatar.getAttribute('data-avatar-state') || 'default',
            'aria-label': avatar.getAttribute('aria-label') || 'Elie, AI assistant',
          })
        );
      });
    };
    const mountOrbs = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      const orbs = [];
      if (node.matches('[data-thinking-orb]')) orbs.push(node);
      orbs.push(...node.querySelectorAll('[data-thinking-orb]'));

      orbs.forEach((orb) => {
        if (orbRoots.has(orb)) return;
        const root = createRoot(orb);
        orbRoots.set(orb, root);
        const state = orb.getAttribute('data-orb-state') || 'searching';
        const sizeAttr = orb.getAttribute('data-orb-size');
        const size = sizeAttr ? Number(sizeAttr) : 20;
        const theme = orb.getAttribute('data-orb-theme') || 'dark';
        const ariaLabel = orb.getAttribute('aria-label') || 'Thinking…';
        root.render(
          React.createElement(ThinkingOrb, {
            state,
            size,
            theme,
            'aria-label': ariaLabel,
          })
        );
      });
    };
    const avatarObserver = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        mountAvatars(node);
        mountOrbs(node);
      }));
      avatarRoots.forEach((root, avatar) => {
        if (avatar.isConnected) return;
        root.unmount();
        avatarRoots.delete(avatar);
      });
      orbRoots.forEach((root, orb) => {
        if (orb.isConnected) return;
        root.unmount();
        orbRoots.delete(orb);
      });
    });
    if (containerRef.current) {
      avatarObserver.observe(containerRef.current, { childList: true, subtree: true });
      mountAvatars(containerRef.current);
      mountOrbs(containerRef.current);
      const composerActions = containerRef.current.querySelector('[data-chat-composer-actions]');
      if (composerActions) {
        composerActionsRoot = createRoot(composerActions);
        composerActionsRoot.render(React.createElement(ChatComposerActions));
      }
      const elieBeamMount = containerRef.current.querySelector('[data-elie-composer-beam]');
      if (elieBeamMount) {
        elieComposerBeamRoot = createRoot(elieBeamMount);
        elieComposerBeamRoot.render(React.createElement(ElieComposerBeam));
      }
    }

    const loadPageScripts = async () => {
      await runLegacyScripts(containerRef.current, scripts);
      if (cancelled || title !== 'Messenger Dashboard' || document.querySelector('script[data-chat-data]')) return;

      if (!document.querySelector('script[data-chat-cache]')) {
        const cacheScript = document.createElement('script');
        cacheScript.src = '/js/chat-cache.js';
        cacheScript.dataset.chatCache = 'true';
        cacheScript.async = false;
        document.body.appendChild(cacheScript);
      }

      const supabaseScript = document.createElement('script');
      supabaseScript.src = '/js/supabase-client.js';
      supabaseScript.dataset.chatSupabase = 'true';
      supabaseScript.async = false;
      document.body.appendChild(supabaseScript);

      const script = document.createElement('script');
      script.src = '/js/chat-data.js';
      script.dataset.chatData = 'true';
      script.async = false;
      const loadChatData = () => {
        if (!cancelled) document.body.appendChild(script);
      };
      supabaseScript.addEventListener('load', loadChatData, { once: true });
      supabaseScript.addEventListener('error', loadChatData, { once: true });
    };
    loadPageScripts().catch((error) => console.error('Legacy page initialization failed:', error));
    return () => {
      cancelled = true;
      avatarObserver.disconnect();
      composerActionsRoot?.unmount();
      elieComposerBeamRoot?.unmount();
      avatarRoots.forEach((root) => root.unmount());
      avatarRoots.clear();
      orbRoots.forEach((root) => root.unmount());
      orbRoots.clear();
    };
  }, [scripts]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <base href="/" />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/favicon-180.png" />
      </Head>
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="beforeInteractive"
      />
      <Script src="/js/varoom-mobile-nav.js" strategy="afterInteractive" />
      <main ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
