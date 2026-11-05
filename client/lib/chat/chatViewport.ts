// Phone composer behaviour (ported from the inline script in
// legacy-pages/chats.html), bound by components/chat/useChatViewport:
// - the app shell follows the visual viewport (--vvh / --vv-top on <html>)
//   so the on-screen keyboard never covers the composer; `.kb-open` while
//   the keyboard is up;
// - the message list stays pinned to the bottom while the user is near it,
//   as the composer or the list resizes;
// - tapping composer buttons keeps the keyboard open (KEEP_FOCUS_SELECTOR).

export const MOBILE_QUERY = '(max-width:760px)';
export const KEEP_FOCUS_SELECTOR = '.send-message, .mobile-attach, .mobile-attach-menu';
/** Within this many px of the bottom, the list stays pinned to it. */
export const STICK_THRESHOLD = 80;
/** The window is this many px taller than the visual viewport: the keyboard is up. */
export const KEYBOARD_THRESHOLD = 100;

/** On phones, pressing a composer button must not take the focus (the keyboard stays open). */
export function keepsKeyboardOpen(isPhone: boolean, target: Element): boolean {
  return isPhone && Boolean(target.closest(KEEP_FOCUS_SELECTOR));
}

/** Binds the phone viewport behaviour; returns the cleanup that releases every listener. */
export function bindChatViewport({ shell, messages, composer, textarea, win, doc }: {
  shell: HTMLElement;
  messages: HTMLElement;
  composer: HTMLElement;
  textarea: HTMLTextAreaElement;
  win: Window;
  doc: Document;
}): () => void {
  const root = doc.documentElement;
  const mq = win.matchMedia(MOBILE_QUERY);
  const vv = win.visualViewport || null;
  let stick = true;
  const timers: number[] = [];

  const keepBottom = () => {
    if (!stick || !mq.matches) return;
    win.requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  };
  const onScroll = () => {
    stick = (messages.scrollHeight - messages.scrollTop - messages.clientHeight) < STICK_THRESHOLD;
  };

  const resetViewport = () => {
    root.style.removeProperty('--vvh');
    root.style.removeProperty('--vv-top');
    shell.classList.remove('kb-open');
  };
  const syncViewport = () => {
    if (!mq.matches) { resetViewport(); return; }
    const height = vv ? vv.height : win.innerHeight;
    const top = vv ? Math.max(0, vv.offsetTop) : 0;
    if (vv && vv.scale > 1.05) { resetViewport(); return; } // pinch-zoomed: don't fight it
    root.style.setProperty('--vvh', `${Math.round(height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(top)}px`);
    shell.classList.toggle('kb-open', doc.activeElement === textarea && (win.innerHeight - height) > KEYBOARD_THRESHOLD);
    keepBottom();
  };
  const later = (ms: number) => { timers.push(win.setTimeout(syncViewport, ms)); };
  const onFocus = () => { syncViewport(); later(150); later(400); }; // iOS animates the keyboard in
  const onBlur = () => { syncViewport(); later(150); };
  const onOrientation = () => later(250);

  messages.addEventListener('scroll', onScroll, { passive: true });
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(keepBottom) : null;
  observer?.observe(composer);
  observer?.observe(messages);
  vv?.addEventListener('resize', syncViewport);
  vv?.addEventListener('scroll', syncViewport);
  win.addEventListener('resize', syncViewport);
  win.addEventListener('orientationchange', onOrientation);
  textarea.addEventListener('focus', onFocus);
  textarea.addEventListener('blur', onBlur);
  mq.addEventListener?.('change', syncViewport);
  syncViewport();

  return () => {
    timers.forEach((timer) => win.clearTimeout(timer));
    messages.removeEventListener('scroll', onScroll);
    observer?.disconnect();
    vv?.removeEventListener('resize', syncViewport);
    vv?.removeEventListener('scroll', syncViewport);
    win.removeEventListener('resize', syncViewport);
    win.removeEventListener('orientationchange', onOrientation);
    textarea.removeEventListener('focus', onFocus);
    textarea.removeEventListener('blur', onBlur);
    mq.removeEventListener?.('change', syncViewport);
    resetViewport();
  };
}
