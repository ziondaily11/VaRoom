// Carrying the email typed on the sign-in panel to Help & Support, which
// opens in a new tab. The email goes through localStorage (shared by tabs of
// the same site), never the URL, so it stays out of history, logs and
// referrers. It is read once and removed, and ignored after a few minutes.

const KEY = 'varoom:support-handoff';
const MAX_AGE_MS = 10 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The support page, opened on the account help form. */
export const ACCOUNT_HELP_HREF = '/support?topic=account';

/**
 * An email with most of the name hidden: "ziondaily@gmail.com" becomes
 * "zi*****ly@gmail.com". Short names keep only their first letter.
 */
export function maskEmail(email: string): string {
  const value = String(email || '').trim();
  const at = value.lastIndexOf('@');
  if (at <= 0) return '';
  const name = value.slice(0, at);
  const domain = value.slice(at);
  if (name.length <= 4) return `${name[0]}${'*'.repeat(Math.max(name.length - 1, 2))}${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(name.length - 4)}${name.slice(-2)}${domain}`;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps a valid email for the support tab to pick up. Anything else clears it. */
export function saveSupportHandoff(email: string, store: Store | null = storage(), now = Date.now()): void {
  if (!store) return;
  const value = String(email || '').trim();
  try {
    if (EMAIL_PATTERN.test(value)) store.setItem(KEY, JSON.stringify({ email: value, at: now }));
    else store.removeItem(KEY);
  } catch {
    // Storage full or blocked: the support page simply asks for the email.
  }
}

/** The handed-over email, once: it is removed as it is read. Null when none or too old. */
export function takeSupportHandoff(store: Store | null = storage(), now = Date.now()): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    store.removeItem(KEY);
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown };
    const email = typeof parsed.email === 'string' ? parsed.email : '';
    const at = typeof parsed.at === 'number' ? parsed.at : 0;
    return EMAIL_PATTERN.test(email) && now - at >= 0 && now - at <= MAX_AGE_MS ? email : null;
  } catch {
    return null;
  }
}
