import { useEffect, type RefObject } from 'react';
import { bindChatViewport } from '../../lib/chat/chatViewport';

// Phone composer behaviour (lib/chat/chatViewport): the shell follows the
// visual viewport, the list stays pinned to the bottom, and composer buttons
// keep the keyboard open.

export { KEEP_FOCUS_SELECTOR } from '../../lib/chat/chatViewport';

export function useChatViewport({ shellRef, messagesRef, composerRef, textareaRef }: {
  shellRef: RefObject<HTMLElement | null>;
  messagesRef: RefObject<HTMLElement | null>;
  composerRef: RefObject<HTMLElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}): void {
  useEffect(() => {
    const shell = shellRef.current;
    const messages = messagesRef.current;
    const composer = composerRef.current;
    const textarea = textareaRef.current;
    if (!shell || !messages || !composer || !textarea) return undefined;
    return bindChatViewport({ shell, messages, composer, textarea, win: window, doc: document });
    // The elements are stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
