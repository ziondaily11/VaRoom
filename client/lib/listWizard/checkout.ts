import type { SaveState, WizardSession } from './wizardSession';

// What the wizard saves before it hands the host to a checkout
// (persistBeforeCheckout in legacy-pages/list.html): Pay to list goes to
// Paystack and Go Pro to the pricing page, and both come back to /list to
// restore and publish the same listing.

/** The parts of the draft session a checkout uses. */
export type CheckoutSession = Pick<WizardSession, 'cancelTimer' | 'checkoutHandoff' | 'settled' | 'documentQueue' | 'ensureShell' | 'saveCheckoutState'
  | 'save' | 'revisionConflict' | 'remoteUnavailable'>;

export interface CheckoutSteps {
  /** The listing shell's first fields, when the shell has to be created. */
  shellPayload: () => Record<string, unknown>;
  /** Uploads the documents chosen so far to the listing. */
  persistDocuments: (listingId: string) => Promise<void>;
  onStatus: (message: string, state: SaveState) => void;
}

/**
 * Waits for the autosave and document uploads, makes sure the listing shell
 * exists, uploads chosen documents, writes and verifies the per-listing
 * checkout copy, then saves the profile draft. A one-time payment
 * (saveProfileDraft false) hands off: autosave stays off unless this fails.
 */
export async function saveForCheckout(current: CheckoutSession, accessToken: string, saveProfileDraft: boolean, steps: CheckoutSteps): Promise<string> {
  current.cancelTimer();
  const handoff = !saveProfileDraft;
  if (handoff) current.checkoutHandoff = true;
  try {
    await current.settled();
    await current.documentQueue;
    const listingId = await current.ensureShell(accessToken, steps.shellPayload);
    await steps.persistDocuments(listingId);
    try { await current.saveCheckoutState(listingId); } catch (error) {
      console.error('Unable to persist the listing checkout state:', error);
      throw new Error('Your listing could not be safely saved for checkout. No payment was started. Please try again or contact support.');
    }
    await current.save(listingId);
    if (current.revisionConflict) steps.onStatus('Checkout save is ready. The saved profile copy will sync after this listing returns.', 'error');
    if (current.remoteUnavailable) steps.onStatus('Checkout save is ready. Profile sync will resume when connected.', 'error');
    return listingId;
  } catch (error) {
    if (handoff) current.checkoutHandoff = false;
    throw error;
  }
}

/** Pay to list: saves everything first, then asks the server for the Paystack checkout URL. */
export async function prepareListingCheckout(token: () => Promise<string | null>, persist: (accessToken: string) => Promise<string>,
  start: (accessToken: string, listingId: string) => Promise<string>): Promise<string> {
  const accessToken = await token();
  if (!accessToken) throw new Error('Please log in again to continue.');
  const listingId = await persist(accessToken);
  return start(accessToken, listingId);
}
