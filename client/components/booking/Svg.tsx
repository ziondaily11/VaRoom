import React from 'react';

// Renders one of the page's constant SVG strings (lib/booking/bookingIcons.ts)
// as a real <svg> element with the same attributes and children.

const parsed = new Map<string, { props: Record<string, string>; inner: string }>();

const reactName = (name: string) => {
  if (name === 'class') return 'className';
  if (name.startsWith('aria-') || name.startsWith('data-')) return name;
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
};

function parse(markup: string) {
  const cached = parsed.get(markup);
  if (cached) return cached;
  const match = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(markup.trim());
  const props: Record<string, string> = {};
  if (match) {
    const attribute = /([\w:-]+)="([^"]*)"/g;
    let found: RegExpExecArray | null;
    while ((found = attribute.exec(match[1]))) props[reactName(found[1])] = found[2];
  }
  const result = { props, inner: match ? match[2] : '' };
  parsed.set(markup, result);
  return result;
}

export default function Svg({ markup }: { markup: string }) {
  const { props, inner } = parse(markup);
  return <svg {...props} dangerouslySetInnerHTML={{ __html: inner }} />;
}
