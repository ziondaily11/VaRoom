import React, { useEffect, useRef, useState } from 'react';
import { parseElieText, type ElieInline } from '../../lib/chat/elieFormat';

// An Elie reply: paragraphs, lists, bold and italic text, and copy blocks for
// text the person will paste elsewhere (lib/chat/elieFormat.ts).

function Inline({ parts }: { parts: ElieInline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'bold') return <strong key={index}>{part.text}</strong>;
        if (part.kind === 'italic') return <em key={index}>{part.text}</em>;
        if (part.kind === 'code') return <code key={index}>{part.text}</code>;
        return <React.Fragment key={index}>{part.text}</React.Fragment>;
      })}
    </>
  );
}

function CopyBlock({ label, text }: { label: string | null; text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch { /* The text stays selectable. */ }
  };
  return (
    <div className="elie-copy-block">
      <div className="elie-copy-head">
        <span>{label || 'Text'}</span>
        <button type="button" onClick={() => { void copy(); }} aria-label={`Copy ${label || 'text'}`}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

export default function ElieText({ text }: { text: string }) {
  return (
    <div className="elie-text">
      {parseElieText(text).map((block, index) => {
        if (block.kind === 'copy') return <CopyBlock key={index} label={block.label} text={block.text} />;
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return <Tag key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} /></li>)}</Tag>;
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}<Inline parts={line} /></React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
