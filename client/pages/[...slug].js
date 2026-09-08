import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Script from 'next/script';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useEffect, useRef } from 'react';
import ElieIcon from '../components/ElieIcon';

const templateDirectory = path.join(process.cwd(), 'legacy-pages');
const routeAliases = {
  properties: 'list.html',
  'landing-page': 'landing page.html',
  register: 'signup-client.html',
  chat: 'chats.html'
};

function templateForSlug(slug) {
  if (!slug || slug.length === 0) return 'index.html';
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

  return renderToStaticMarkup(
    React.createElement(ElieIcon, {
      className,
      style: style ? styleStringToObject(style) : undefined,
      'aria-label': alt || undefined,
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

function parseTemplate(source, isEliePage) {
  source = markActiveElieNavigation(source, isEliePage);
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
  const templates = fs.readdirSync(templateDirectory).filter((file) => file.endsWith('.html'));
  const paths = templates
    .filter((file) => file !== 'index.html')
    .map((file) => ({
      params: { slug: [file.replace(/\.html$/, '').replace(/ /g, '-') ] }
    }));

  paths.push(
    { params: { slug: ['properties'] } },
    { params: { slug: ['register'] } },
    { params: { slug: ['chat'] } }
  );
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const templateName = templateForSlug(params && params.slug);
  const source = fs.readFileSync(path.join(templateDirectory, templateName), 'utf8');
  return { props: { ...parseTemplate(source, templateName === 'elie.html') } };
}

async function runLegacyScripts(container, scripts) {
  if (scripts.some(({ attributes }) => attributes.includes('@supabase/supabase-js'))) {
    await new Promise((resolve) => {
      const startedAt = Date.now();
      const waitForSupabase = () => {
        if (window.supabase || Date.now() - startedAt >= 10000) {
          resolve();
          return;
        }
        window.setTimeout(waitForSupabase, 50);
      };
      waitForSupabase();
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
}

export default function LegacyPage({ title, markup, scripts }) {
  const containerRef = useRef(null);

  useEffect(() => {
    runLegacyScripts(containerRef.current, scripts);
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
      <main ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
