import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect, useRef } from 'react';

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

function parseTemplate(source) {
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
  return { props: { ...parseTemplate(source) } };
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
      </Head>
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="beforeInteractive"
      />
      <main ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
