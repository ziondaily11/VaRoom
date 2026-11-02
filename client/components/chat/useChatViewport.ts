import { useEffect, type RefObject } from 'react';

// Phone composer behaviour (ported from the inline script in
// legacy-pages/chats.html):
// - the app shell follows the visual viewport (--vvh / --vv-top on <html>)
//   so the on-screen keyboard never covers the composer; `.kb-open` while
//   the keyboard is up;
// - the message list stays pinned to the bottom while the user is near it,
//   as the composer or the list resizes;
// - tapping composer buttons keeps the keyboard open.

const MOBILE_QUERY = '(max-width:760px)';
export const KEEP_FOCUS_SELECTOR = '.send-message, .mobile-attach, .mobile-attach-menu';

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

    const root = document.documentElement;
    const mq = window.matchMedia(MOBILE_QUERY);
    const vv = window.visualViewport || null;
    let stick = true;
    const timers: number[] = [];

    const keepBottom = () => {
      if (!stick || !mq.matches) return;
      window.requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
    };
    const onScroll = () => {
      stick = (messages.scrollHeight - messages.scrollTop - messages.clientHeight) < 80;
    };

    const resetViewport = () => {
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vv-top');
      shell.classList.remove('kb-open');
    };
    const syncViewport = () => {
      if (!mq.matches) { resetViewport(); return; }
      const height = vv ? vv.height : window.innerHeight;
      const top = vv ? Math.max(0, vv.offsetTop) : 0;
      if (vv && vv.scale > 1.05) { resetViewport(); return; } // pinch-zoomed: don't fight it
      root.style.setProperty('--vvh', `${Math.round(height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(top)}px`);
      shell.classList.toggle('kb-open', document.activeElement === textarea && (window.innerHeight - height) > 100);
      keepBottom();
    };
    const later = (ms: number) => { timers.push(window.setTimeout(syncViewport, ms)); };
    const onFocus = () => { syncViewport(); later(150); later(400); }; // iOS animates the keyboard in
    const onBlur = () => { syncViewport(); later(150); };
    const onOrientation = () => later(250);

    messages.addEventListener('scroll', onScroll, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(keepBottom) : null;
    observer?.observe(composer);
    observer?.observe(messages);
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', onOrientation);
    textarea.addEventListener('focus', onFocus);
    textarea.addEventListener('blur', onBlur);
    mq.addEventListener?.('change', syncViewport);
    syncViewport();

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      messages.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', onOrientation);
      textarea.removeEventListener('focus', onFocus);
      textarea.removeEventListener('blur', onBlur);
      mq.removeEventListener?.('change', syncViewport);
      resetViewport();
    };
    // The elements are stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
