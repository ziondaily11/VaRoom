import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import { useEffect, useRef } from 'react';

const templateDirectory = path.join(process.cwd(), 'legacy-pages');
const routeAliases = {
  properties: 'list.html',
  'landing-page': 'landing page.html'
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

  paths.push({ params: { slug: ['properties'] } });
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const templateName = templateForSlug(params && params.slug);
  const source = fs.readFileSync(path.join(templateDirectory, templateName), 'utf8');
  return { props: { ...parseTemplate(source) } };
}

function runLegacyScripts(container, scripts) {
  scripts.forEach(({ attributes, content }) => {
    const script = document.createElement('script');
    const attributePattern = /([^\s=]+)(?:="([^"]*)")?/g;
    let match;
    while ((match = attributePattern.exec(attributes))) {
      if (match[1].toLowerCase() !== 'src') script.setAttribute(match[1], match[2] || '');
      else script.src = match[2];
    }
    script.text = content;
    container.appendChild(script);
  });
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
      <main ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
