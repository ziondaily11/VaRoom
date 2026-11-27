// Paystack's card popup (InlineJS v2), opened over VaRoom's checkout window
// so the host never leaves the page. The script loads once, only when a host
// pays by card. A popup "success" unlocks nothing: the server verifies the
// reference before anything changes.

export const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v2/inline.js';

interface PopupCallbacks {
  onLoad: () => void;
  onSuccess: (transaction: { reference?: string }) => void;
  onCancel: () => void;
  onError: (error: unknown) => void;
}

interface PaystackPopInstance { resumeTransaction: (accessCode: string, callbacks: PopupCallbacks) => void }
type PaystackPopClass = new () => PaystackPopInstance;

let loading: Promise<PaystackPopClass> | null = null;

/** The PaystackPop class, loading Paystack's script on first use. Rejects when it is blocked or offline. */
export function loadPaystackPop(doc: Document = document): Promise<PaystackPopClass> {
  const ready = () => (window as unknown as { PaystackPop?: PaystackPopClass }).PaystackPop;
  if (ready()) return Promise.resolve(ready() as PaystackPopClass);
  if (loading) return loading;
  loading = new Promise<PaystackPopClass>((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = PAYSTACK_INLINE_SRC;
    script.async = true;
    script.onload = () => { const Pop = ready(); if (Pop) resolve(Pop); else reject(new Error('Paystack did not load')); };
    script.onerror = () => reject(new Error('Paystack could not load'));
    doc.head.appendChild(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

export type PopupResult = { outcome: 'success'; reference: string | null } | { outcome: 'cancel' } | { outcome: 'error' };

/**
 * Opens Paystack's card popup for a transaction the server already started;
 * resolves when it closes. `onLoad` fires once the popup has actually shown.
 * A blocker (a browser privacy setting or an ad blocker) can let the script run but stop the popup
 * itself, and then no callback ever comes, so callers must not wait on it alone.
 */
export async function payByCard(accessCode: string, onLoad: () => void = () => {}): Promise<PopupResult> {
  const PaystackPop = await loadPaystackPop();
  return new Promise<PopupResult>((resolve) => {
    new PaystackPop().resumeTransaction(accessCode, {
      onLoad,
      onSuccess: (transaction) => resolve({ outcome: 'success', reference: transaction && typeof transaction.reference === 'string' ? transaction.reference : null }),
      onCancel: () => resolve({ outcome: 'cancel' }),
      onError: (error) => { console.warn('Paystack popup error:', error); resolve({ outcome: 'error' }); },
    });
  });
}
