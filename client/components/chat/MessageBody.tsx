import React from 'react';
import { hasMessageMarkup, parseMessageBody, type MessageBodyNode } from '../../lib/chat/messageBody';

// A message's text in its bubble: plain text unless it carries the desktop
// editor's formatting, which is rebuilt from allowlisted elements with no
// attributes (lib/chat/messageBody). Never injected as HTML.

export function renderMessageBody(body: string): React.ReactNode {
  if (!body) return null;
  if (!hasMessageMarkup(body)) {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</span>;
  }
  const renderNodes = (nodes: MessageBodyNode[]): React.ReactNode[] => nodes.map((node, index) => (
    typeof node === 'string'
      ? node
      : React.createElement(node.tag, { key: index }, node.tag === 'br' ? undefined : renderNodes(node.children))
  ));
  return <span style={{ wordBreak: 'break-word' }}>{renderNodes(parseMessageBody(body))}</span>;
}
