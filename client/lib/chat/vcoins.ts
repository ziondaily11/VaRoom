import type { CheckoutStart, ListingPayment, PaymentState } from '../billing/pricing';

// V-Coins pay for Elie search (server/lib/vcoins.js). Every account can buy
// them; a host plan that includes Elie covers search instead (`included`).
// The server owns packs and prices; the browser only names a pack.

export const VCOIN_SEARCH_COST = 10;
export const VCOIN_NEWS_COST = 15;

export interface VcoinWallet { balance: number; included: boolean }
export interface VcoinPack { id: string; coins: number; price_kes: number }

/** The composer meter's colour: green 50+, yellow 20–49, red under 20 (a plan that includes Elie is always green). */
export type VcoinLevel = 'green' | 'yellow' | 'red';
export function vcoinLevel(wallet: VcoinWallet): VcoinLevel {
  if (wallet.included || wallet.balance >= 50) return 'green';
  return wallet.balance >= 20 ? 'yellow' : 'red';
}

/** How full the meter ring is: 100 coins or more fills it. */
export const vcoinFill = (wallet: VcoinWallet) => (wallet.included ? 1 : Math.max(0, Math.min(1, wallet.balance / 100)));

type FetchFn = typeof fetch;
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const readJson = (response: Response) => response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
const toWallet = (value: Record<string, unknown>): VcoinWallet => ({ balance: Number(value.balance) || 0, included: value.included === true });

export async function fetchVcoins(token: string, fetchFn: FetchFn = fetch): Promise<VcoinWallet & { packs: VcoinPack[] }> {
  const response = await fetchFn('/api/vcoins', { headers: headers(token) });
  const result = await readJson(response);
  if (!response.ok) throw new Error((result.error as string) || 'Unable to load your V-Coins');
  return { ...toWallet(result), packs: Array.isArray(result.packs) ? (result.packs as VcoinPack[]) : [] };
}

export async function startVcoinCheckout(token: string, pack: string, payment: ListingPayment, fetchFn: FetchFn = fetch): Promise<CheckoutStart> {
  const response = await fetchFn('/api/vcoins/checkout', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ pack, channel: payment.channel, ...(payment.channel === 'mpesa' ? { phone: payment.phone } : {}) }),
  });
  const result = await readJson(response);
  const reference = typeof result.reference === 'string' ? result.reference : '';
  if (response.ok && reference && result.channel === 'mpesa') {
    return { channel: 'mpesa', reference, displayText: typeof result.display_text === 'string' ? result.display_text : 'Check your phone and enter your M-Pesa PIN.' };
  }
  if (!response.ok || !reference || typeof result.authorization_url !== 'string') throw new Error((result.error as string) || 'Unable to start checkout.');
  return { channel: 'card', reference, accessCode: typeof result.access_code === 'string' ? result.access_code : null, authorizationUrl: result.authorization_url };
}

/**
 * One server check of a V-Coin payment, with the wallet after it. While
 * M-Pesa waits for the PIN an unpaid charge may read as abandoned, so that
 * counts as failed only once the wait is over.
 */
export async function checkVcoinPayment(token: string, reference: string, waitingForPin: boolean, fetchFn: FetchFn = fetch): Promise<{ state: PaymentState; wallet: VcoinWallet }> {
  const response = await fetchFn(`/api/vcoins/payments/${encodeURIComponent(reference)}`, { headers: headers(token) });
  const result = await readJson(response);
  if (!response.ok) throw new Error((result.error as string) || 'Unable to verify payment');
  const status = (result.payment as { status?: string } | undefined)?.status || '';
  const state: PaymentState = status === 'succeeded' ? 'paid'
    : status === 'failed' || status === 'refunded' || (status === 'abandoned' && !waitingForPin) ? 'failed' : 'pending';
  return { state, wallet: toWallet(result) };
}
