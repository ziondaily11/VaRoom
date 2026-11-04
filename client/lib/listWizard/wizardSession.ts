import type { ListingDraftCache } from './draftCache';
import { CHECKOUT_POINTER_PREFIX } from './draftCache';
import type { DraftSnapshot, MediaMetadata, SnapshotIdentity } from './drafts';
import { checkoutSnapshotMatches, draftFormData, draftMediaMetadata } from './drafts';
import { createListingShell, putRemoteDraft } from './api';

// One listing-creation session's draft bookkeeping (migrated from the
// module-level state of legacy-pages/list.html): which draft and listing
// shell it owns, the server revision, and the queues that keep autosave,
// document uploads, page hide and checkout from writing over each other.

export type SaveState = 'saving' | 'saved' | 'error';

export interface CheckoutPointer { hostId: string; listingId: string; category: string; draftId: string | null; cacheKey: string; createdAt: number }

export interface WizardSessionOptions {
  hostId: string;
  editMode: boolean;
  cache: ListingDraftCache;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** The current wizard as a snapshot. */
  capture: (identity: SnapshotIdentity) => DraftSnapshot;
  /** The current access token for this host, or null when signed out / switched. */
  token: () => Promise<string | null>;
  onStatus: (message: string, state: SaveState) => void;
  /** A new draft id exists (the page keeps it in the URL). */
  onDraftId: (draftId: string) => void;
  /** Whether a returned payment for this listing has been verified. */
  paymentVerified: () => boolean;
}

const randomId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const checkoutPointerKey = (hostId: string, listingId: string) => `${CHECKOUT_POINTER_PREFIX}${hostId}:${listingId}`;

/**
 * The /list URL carrying a new draft id, so a refresh reopens this session
 * rather than starting a second one; null when the URL keeps its own state
 * (editing, a payment return, another page, or a draft already named).
 */
export function draftContinuationUrl(query: { edit: string | null; reference: string | null } | null, pathname: string, search: string, draftId: string): string | null {
  if (!query || query.edit || query.reference || !/\/list(?:\.html)?$/.test(pathname)) return null;
  const params = new URLSearchParams(search);
  if (params.get('draft')) return null;
  params.set('draft', draftId);
  return `${pathname}?${params.toString()}`;
}

export class WizardSession {
  readonly hostId: string;
  draftId: string | null = null;
  cacheKey: string | null = null;
  revision = 0;
  revisionConflict = false;
  remoteUnavailable = false;
  /** The listing shell this session created (or the listing being edited). */
  listingId: string | null = null;
  restoring = false;
  checkoutHandoff = false;
  /** Published, discarded or saved on the way out: nothing more to autosave. */
  finished = false;
  /** Waits for documents being uploaded; Save as draft and checkout wait on it. */
  documentQueue: Promise<unknown> = Promise.resolve();
  private saveQueue: Promise<unknown> = Promise.resolve();
  private writeQueue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shellPromise: Promise<string> | null = null;
  private readonly options: WizardSessionOptions;

  constructor(options: WizardSessionOptions) {
    this.options = options;
    this.hostId = options.hostId;
  }

  identity(listingId = this.listingId): SnapshotIdentity {
    return { cacheKey: this.cacheKey || `${this.hostId}:${this.draftId}`, draftId: this.draftId, hostId: this.hostId, listingId, serverRevision: this.revision };
  }

  // ---------- Checkout save state ----------

  checkoutPointer(listingId: string | null): CheckoutPointer | null {
    const { storage } = this.options;
    if (!storage || !listingId) return null;
    try {
      const pointer = JSON.parse(storage.getItem(checkoutPointerKey(this.hostId, listingId)) || 'null') as CheckoutPointer | null;
      if (!pointer || pointer.hostId !== this.hostId || pointer.listingId !== listingId || pointer.cacheKey !== `${this.hostId}:checkout:${listingId}`) return null;
      return pointer;
    } catch (error) {
      console.warn('Unable to read the payment checkout save state:', error);
      return null;
    }
  }

  /** Writes the complete form (and media files) for a checkout and checks it reads back intact. */
  async saveCheckoutState(listingId: string): Promise<DraftSnapshot> {
    const { cache, storage } = this.options;
    if (!listingId || !storage) throw new Error('The payment listing could not be linked to its saved form.');
    const cacheKey = `${this.hostId}:checkout:${listingId}`;
    const snapshot = this.options.capture(this.identity(listingId));
    snapshot.cacheKey = cacheKey;
    snapshot.checkoutState = true;
    snapshot.createdAt = Date.now();
    await cache.save(snapshot);
    const saved = await cache.load<DraftSnapshot>(cacheKey);
    if (!checkoutSnapshotMatches(saved, snapshot)) throw new Error('The saved checkout state could not be verified.');
    const pointer: CheckoutPointer = { hostId: this.hostId, listingId, category: snapshot.category, draftId: snapshot.draftId || null, cacheKey, createdAt: snapshot.createdAt };
    storage.setItem(checkoutPointerKey(this.hostId, listingId), JSON.stringify(pointer));
    return snapshot;
  }

  async clearCheckoutState(listingId: string): Promise<void> {
    const pointer = this.checkoutPointer(listingId);
    if (!pointer || !this.options.storage) return;
    await this.options.cache.remove(pointer.cacheKey);
    this.options.storage.removeItem(checkoutPointerKey(this.hostId, listingId));
  }

  /** After a verified payment, keep the checkout copy in step with later edits. */
  private async mirrorVerifiedCheckout(draft: DraftSnapshot, serverMediaMetadata?: MediaMetadata[] | null): Promise<void> {
    if (!this.options.paymentVerified()) return;
    const listingId = draft.listingId || this.listingId;
    const pointer = this.checkoutPointer(listingId);
    if (!pointer || (pointer.draftId && pointer.draftId !== draft.draftId)) return;
    const metadata = serverMediaMetadata || draft.serverMediaMetadata || [];
    await this.options.cache.save({
      ...draft,
      cacheKey: pointer.cacheKey,
      draftId: pointer.draftId || draft.draftId,
      listingId,
      checkoutState: true,
      serverMediaMetadata: metadata,
      mediaSelected: Boolean((draft.mediaFiles && draft.mediaFiles.length) || metadata.some((item) => item.kind === 'listing_media')),
    });
  }

  // ---------- Drafts ----------

  private async saveNow(listingId: string | null, keepalive: boolean, localOnly: boolean): Promise<DraftSnapshot> {
    const { cache, onStatus } = this.options;
    if (!this.draftId) {
      this.draftId = randomId();
      this.options.onDraftId(this.draftId);
    }
    this.cacheKey = `${this.hostId}:${this.draftId}`;
    const draft = this.options.capture(this.identity(listingId));
    this.cacheKey = draft.cacheKey;
    await cache.save(draft);
    try { await this.mirrorVerifiedCheckout(draft); } catch (error) { console.warn('Unable to refresh the local post-checkout save state:', error); }
    cache.setPointer(this.hostId, {
      hostId: this.hostId, cacheKey: draft.cacheKey, draftId: draft.draftId, listingId: draft.listingId, category: draft.category, createdAt: draft.createdAt, returnTo: 'list',
    });
    if (localOnly) return draft;
    if (this.revisionConflict) {
      onStatus('Saved on this device. A newer draft exists on another session; reload from My Profile before syncing.', 'error');
      return draft;
    }
    const token = await this.options.token();
    if (!token) {
      this.remoteUnavailable = true;
      onStatus('Saved on this device; waiting for a connection to sync.', 'error');
      return draft;
    }
    const outcome = await putRemoteDraft(token, this.draftId, {
      category: draft.category, form_data: draftFormData(draft), media_metadata: draftMediaMetadata(draft), listing_id: draft.listingId, revision: this.revision,
    }, keepalive);
    if (outcome.ok === false) {
      if (outcome.conflict) {
        this.revisionConflict = true;
        onStatus('Saved on this device. Another session has a newer copy; reopen the saved draft from My Profile.', 'error');
      } else {
        this.remoteUnavailable = true;
        onStatus('Saved on this device; sync will retry when the connection returns.', 'error');
        console.warn('Listing draft profile sync is unavailable:', outcome.message);
      }
      return draft;
    }
    this.remoteUnavailable = false;
    this.revision = outcome.revision || this.revision + 1;
    draft.serverRevision = this.revision;
    draft.updatedAt = outcome.updatedAt || new Date().toISOString();
    await cache.save(draft);
    try { await this.mirrorVerifiedCheckout(draft, outcome.mediaMetadata); } catch (error) { console.warn('Unable to refresh the local post-checkout save state:', error); }
    onStatus('Saved', 'saved');
    return draft;
  }

  /** One draft write at a time, so two never reuse the same revision. */
  save(listingId: string | null = this.listingId, keepalive = false, localOnly = false): Promise<DraftSnapshot> {
    const write = this.writeQueue.catch(() => undefined).then(() => this.saveNow(listingId, keepalive, localOnly));
    this.writeQueue = write.catch(() => undefined);
    return write;
  }

  private canAutosave() { return !this.options.editMode && !this.restoring && !this.checkoutHandoff && !this.finished; }

  /** Autosave 450 ms after the last change. */
  queueSave(): void {
    if (!this.canAutosave()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.options.onStatus('Saving…', 'saving');
      this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.save()).catch((error) => console.warn('Unable to save the listing draft:', error));
    }, 450);
  }

  /** The page is going away: save now, with keepalive. */
  saveBeforeLeaving(): void {
    if (!this.canAutosave()) return;
    this.cancelTimer();
    this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.save(this.listingId, true)).catch((error) => console.warn('Unable to save the listing draft before leaving:', error));
  }

  cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Waits for an autosave already on its way. */
  settled(): Promise<unknown> { return this.saveQueue.catch(() => undefined); }

  // ---------- Listing shell ----------

  /** The listing this session owns, creating its payment-draft shell once. */
  async ensureShell(token: string, payload: () => Record<string, unknown>): Promise<string> {
    if (this.listingId) return this.listingId;
    if (!this.shellPromise) {
      this.shellPromise = createListingShell(token, payload()).then((id) => { this.listingId = id; return id; });
    }
    try {
      return await this.shellPromise;
    } finally {
      this.shellPromise = null;
    }
  }
}
