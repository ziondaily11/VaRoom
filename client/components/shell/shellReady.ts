// Legacy page scripts check the shell once, as they run (for example
// host-home.html skips its own sidebar wiring when `.host-layout-active`
// exists). On a hard load the shell is pending until the account's role is
// known, so those scripts wait for it to settle.

export const SHELL_PENDING_SELECTOR = '[data-app-shell][data-shell-state="pending"]';

export function waitForShellReady(doc: Document, timeoutMs = 4000): Promise<void> {
  const pending = doc.querySelector(SHELL_PENDING_SELECTOR);
  if (!pending) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (!doc.querySelector(SHELL_PENDING_SELECTOR)) finish();
    });
    observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['data-shell-state'] });
    const timer = window.setTimeout(finish, timeoutMs);
  });
}
