import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, WizardForm } from './formState';
import { emptyForm, isOfficeShop } from './formState';
import { CATEGORY_LABELS } from './copy';
import type { ListingDraftCache } from './draftCache';
import type { DocumentRefs, DraftSnapshot, RemoteDraft, WizardMedia } from './drafts';
import { captureSnapshot, draftFormData, draftMediaMetadata, pendingDocumentSelections, restoreSnapshot, sameCategory, snapshotFromRemote } from './drafts';
import type { VerifiedPayment } from './api';
import {
  fetchDiningConfig, fetchListingDocuments, fetchNichePlanActive, fetchRemoteDraft, fetchRemoteDrafts, refsFromDocuments, tryFetchRemoteDraft, verifyReturnedPayment,
} from './api';
import type { EditDetailsRow, EditListingRow } from './publish';
import { editForm, editOfficeShopDocuments, effectivePriceUnit, isPaidNiche } from './publish';
import type { ListingDocument } from './policyDocuments';
import type { WizardSession } from './wizardSession';

// Opening the listing wizard (checkAuth, loadEditListing and
// restoreListingDraftAfterUpgrade in legacy-pages/list.html): the host and
// niche checks, a returned Paystack payment, the plan check, then either a
// listing to edit or a saved draft to continue. The page applies the outcome.

export interface WizardQuery { edit: string | null; draft: string | null; payment: string | null; subscription: string | null; reference: string | null }

export interface Flags {
  paymentVerified: boolean;
  returnedPaymentVerified: boolean;
  subscriptionVerified: boolean;
  hasCurrentListingFee: boolean;
  entitlementChecked: boolean;
  listingIsPaused: boolean;
  listingNeedsPublication: boolean;
  hasActiveNichePlan: boolean;
  /** Payment returned but the form couldn't be restored: publishing waits. */
  publishBlocked: boolean;
}

export const INITIAL_FLAGS: Flags = {
  paymentVerified: false, returnedPaymentVerified: false, subscriptionVerified: false, hasCurrentListingFee: false, entitlementChecked: false,
  listingIsPaused: false, listingNeedsPublication: false, hasActiveNichePlan: false, publishBlocked: false,
};

export interface Message { text: string; error: boolean }

/** What edit mode loads besides the form. */
export interface EditData {
  existingPhotos: Array<{ url: string }>;
  existingPolicyUrl: string | null;
  /** The /documents rows (office/shop show them as links). */
  documents: ListingDocument[];
  /** office_shop_details.documents with the current document ids. */
  officeShopDocuments: Record<string, unknown> | null;
  savedDates: string[];
}

export type StartupOutcome =
  | { status: 'signed-out' }
  | { status: 'stopped'; text: string; redirect?: { to: string; delayMs: number } }
  | {
    status: 'ready';
    category: Category;
    flags: Flags;
    officeShopTypeSelected: boolean;
    /** The restored or edited form (null: a fresh form). */
    form: WizardForm | null;
    media: Partial<WizardMedia>;
    edit: EditData | null;
    /** Shown in order; the last one stays on screen, as before. */
    messages: Message[];
  };

export interface StartupDeps {
  client: SupabaseClient;
  session: WizardSession;
  draftCache: ListingDraftCache | null;
  hostId: string;
  params: WizardQuery;
  /** The "Checking your account..." line. */
  onChecking: (text: string) => void;
  /** Replaces the URL without a navigation (the verified payment state). */
  replaceUrl: (url: string) => void;
}

const LEGACY_UPGRADE_DRAFT_KEY = 'varoom_listing_draft_after_upgrade';
const LEGACY_UPGRADE_KEY = 'varoom_listing_after_upgrade';
const isCategory = (value: unknown): value is Category => typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value);
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback;
const planNiche = (category: Category) => (category === 'property' ? 'property' : 'shops_offices');

export async function startWizard(deps: StartupDeps): Promise<StartupOutcome> {
  const { client, session, draftCache, hostId, params } = deps;
  const paymentReturn = params.reference && ['return', 'verified'].includes(params.payment || '') ? params.reference : null;
  const subscriptionReturn = params.reference && ['return', 'verified'].includes(params.subscription || '') ? params.reference : null;
  const recoveryReference = paymentReturn || subscriptionReturn;
  const flags: Flags = { ...INITIAL_FLAGS };
  let returnedMessage: string | null = null;

  const { data: { session: auth } } = await client.auth.getSession();
  if (!auth) return { status: 'signed-out' };
  const accessToken = auth.access_token;
  const { data: profile, error: profileError } = await client.from('profiles').select('role, listing_categories').eq('id', hostId).single();
  const row = profile as { role?: string; listing_categories?: unknown } | null;
  if (profileError || !row || row.role !== 'host') return { status: 'stopped', text: 'Only host accounts can list a space. Redirecting...', redirect: { to: '/', delayMs: 1500 } };

  let niche: Category;
  let continuationDraft: RemoteDraft | null = null;
  let continuationPointer: { cacheKey?: string | null; draftId?: string | null; category?: string | null } | null = null;
  let checkoutSnapshot: DraftSnapshot | null = null;

  if (!params.edit && (params.draft || recoveryReference)) {
    continuationPointer = draftCache ? draftCache.getPointer(hostId) : null;
    // Continue Listing must load its profile draft; a Paystack return verifies payment first instead.
    if (params.draft) {
      try {
        continuationDraft = await fetchRemoteDraft(accessToken, params.draft);
        session.draftId = continuationDraft.id;
      } catch (error) {
        return { status: 'stopped', text: `Unable to continue this listing: ${errorMessage(error, 'Listing draft not found')}` };
      }
    } else if (paymentReturn && continuationPointer) {
      session.draftId = continuationPointer.draftId || null;
      session.cacheKey = continuationPointer.cacheKey || null;
    }
  }

  if (params.edit) {
    const { data: listing, error: listingError } = await client.from('listings')
      .select('id,host_id,category,availability_status,publication_state,paid_listing_until').eq('id', params.edit).eq('host_id', hostId).maybeSingle();
    const found = listing as { category?: string; availability_status?: string; publication_state?: string; paid_listing_until?: string | null } | null;
    if (listingError || !found || !isCategory(found.category)) {
      return { status: 'stopped', text: listingError ? 'Unable to load this listing. Please try again.' : 'This listing could not be found or is not yours to edit.' };
    }
    niche = found.category;
    flags.listingIsPaused = found.availability_status === 'paused';
    flags.listingNeedsPublication = found.publication_state !== 'published';
    flags.hasCurrentListingFee = Boolean(found.paid_listing_until && new Date(found.paid_listing_until).getTime() > Date.now());
  } else {
    const niches = Array.isArray(row.listing_categories) ? (row.listing_categories as string[]) : [];
    if (niches.length !== 1 || !isCategory(niches[0])) {
      return { status: 'stopped', text: 'Choose your posting niche before creating a listing. Redirecting...', redirect: { to: '/profile?select-niches=1', delayMs: 1200 } };
    }
    niche = niches[0];
    const resume = (continuationDraft && continuationDraft.category) || (continuationPointer && continuationPointer.category);
    if (isCategory(resume)) {
      if (!sameCategory(niche, resume)) return { status: 'stopped', text: 'This saved listing does not match your host profile category.' };
      niche = resume;
    }
  }

  if (recoveryReference) {
    deps.onChecking('Confirming your payment...');
    try {
      const attempts = params.payment === 'return' || params.subscription === 'return' ? 30 : 1;
      const payment: VerifiedPayment | null = await verifyReturnedPayment(accessToken, recoveryReference, attempts, Boolean(subscriptionReturn));
      const listingPayment = Boolean(payment && payment.payment_kind === 'listing');
      const linkedSubscription = Boolean(payment && subscriptionReturn && payment.payment_kind !== 'listing' && payment.listing_id && payment.niche === planNiche(niche));
      if (payment && payment.listing_id && (listingPayment || linkedSubscription)) {
        session.listingId = payment.listing_id;
        const pointer = session.checkoutPointer(payment.listing_id);
        if (pointer && draftCache) {
          try {
            const cached = await draftCache.load<DraftSnapshot>(pointer.cacheKey);
            if (cached && cached.checkoutState === true && cached.hostId === hostId && cached.listingId === payment.listing_id
                && cached.cacheKey === pointer.cacheKey && cached.fields && sameCategory(cached.category, niche)) {
              checkoutSnapshot = cached;
              continuationPointer = pointer;
              session.draftId = pointer.draftId || cached.draftId || null;
              session.cacheKey = pointer.cacheKey;
              niche = cached.category;
            }
          } catch (error) { console.warn('Unable to load the local payment save state:', error); }
          if (pointer.draftId) {
            const remote = await tryFetchRemoteDraft(accessToken, pointer.draftId);
            if (remote && remote.listing_id === payment.listing_id) {
              continuationDraft = remote;
              session.draftId = remote.id;
              session.revision = Number(remote.revision) || 0;
            }
          }
        }
        // Older checkouts have no save state; the server draft is a fallback that never blocks payment.
        if (!checkoutSnapshot) {
          try {
            const drafts = await fetchRemoteDrafts(accessToken);
            const matched = drafts ? drafts.find((draft) => draft.listing_id === payment.listing_id) : null;
            if (matched && isCategory(matched.category)) {
              continuationDraft = matched;
              continuationPointer = null;
              session.draftId = matched.id;
              niche = matched.category;
            }
          } catch (error) { console.warn('Unable to match the returned payment to its saved listing draft:', error); }
        }
      }
      const verifiedUrl = (key: 'payment' | 'subscription') => {
        const next = new URLSearchParams(window.location.search);
        next.set(key, 'verified');
        next.set('reference', recoveryReference);
        deps.replaceUrl(`/list?${next.toString()}`);
      };
      if (payment && payment.status === 'succeeded' && payment.payment_kind === 'listing' && payment.listing_id) {
        // Only the authenticated server check unlocks publishing, never the callback URL.
        flags.paymentVerified = true;
        flags.returnedPaymentVerified = true;
        flags.hasCurrentListingFee = true;
        session.listingId = payment.listing_id;
        verifiedUrl('payment');
      } else if (payment && payment.status === 'succeeded' && subscriptionReturn && payment.payment_kind !== 'listing'
          && payment.listing_id && payment.niche === planNiche(niche)) {
        flags.subscriptionVerified = true;
        flags.returnedPaymentVerified = true;
        verifiedUrl('subscription');
      } else if (payment && ['failed', 'abandoned', 'refunded'].includes(payment.status)) {
        returnedMessage = 'Payment was not completed. Your listing has not been published; you can retry checkout.';
      } else {
        returnedMessage = 'Payment is still being verified. Your listing has not been published; your saved draft is preserved. Return to this page shortly to check again.';
      }
    } catch (error) {
      console.warn('Listing payment return verification is temporarily unavailable:', error);
      returnedMessage = errorMessage(error, 'Unable to confirm this payment yet. Your saved draft is preserved.');
    }
  }

  if (isPaidNiche(niche)) {
    try {
      flags.hasActiveNichePlan = await fetchNichePlanActive(accessToken, niche);
      flags.entitlementChecked = true;
    } catch (_) { /* The note under the buttons explains. */ }
  }

  let form: WizardForm | null = null;
  let media: Partial<WizardMedia> = {};
  let edit: EditData | null = null;
  let officeShopTypeSelected = Boolean(params.edit) && isOfficeShop(niche);
  const messages: Message[] = [];

  if (!params.edit && (params.draft || recoveryReference)) {
    const restored = await restoreDraft(deps, niche, continuationDraft, continuationPointer, checkoutSnapshot, flags, Boolean(recoveryReference), Boolean(params.draft));
    form = restored.form;
    media = restored.media;
    messages.push(...restored.messages);
    if (restored.form && isOfficeShop(niche)) officeShopTypeSelected = true;
  }
  if (params.edit) {
    try {
      const loaded = await loadEditListing(client, hostId, params.edit, accessToken, niche);
      form = loaded.form;
      media = { documentRefs: loaded.documentRefs };
      edit = loaded.edit;
    } catch (error) {
      return { status: 'stopped', text: `Unable to load this listing: ${errorMessage(error, 'Please try again.')}` };
    }
  }
  if (flags.subscriptionVerified) messages.push({ text: 'Your plan is active. Your saved listing has been restored for review and publishing.', error: false });
  else if (flags.returnedPaymentVerified) messages.push({ text: 'Payment confirmed. Review your listing, then select Publish Listing when you are ready.', error: false });
  else if (returnedMessage) messages.push({ text: returnedMessage, error: true });
  return { status: 'ready', category: niche, flags, officeShopTypeSelected, form, media, edit, messages };
}

/** loadEditListing: the listing, its booking details, photos, documents, dining and open dates. */
async function loadEditListing(client: SupabaseClient, hostId: string, id: string, accessToken: string, niche: Category): Promise<{ form: WizardForm; documentRefs: DocumentRefs; edit: EditData }> {
  const [listingResult, detailsResult, photosResult] = await Promise.all([
    client.from('listings').select('*').eq('id', id).eq('host_id', hostId).maybeSingle(),
    client.from('listing_booking_details').select('*').eq('listing_id', id).maybeSingle(),
    client.from('listing_photos').select('storage_path').eq('listing_id', id),
  ]);
  if (listingResult.error) throw listingResult.error;
  if (!listingResult.data) throw new Error('This listing could not be found or is not yours to edit.');
  if (detailsResult.error) throw detailsResult.error;
  if (photosResult.error) throw photosResult.error;
  const listing = listingResult.data as EditListingRow;
  const details = (detailsResult.data || null) as EditDetailsRow | null;
  const existingPhotos = ((photosResult.data || []) as Array<{ storage_path?: string }>).filter((photo) => photo.storage_path)
    .map((photo) => ({ url: client.storage.from('listing-photos').getPublicUrl(String(photo.storage_path)).data.publicUrl }));

  // Only property, office and shop listings have documents; the route answers 404 for the
  // rest, which used to stop every Airbnb, hotel and venue listing from opening for editing.
  const documents: ListingDocument[] = isPaidNiche(niche) ? await fetchListingDocuments(accessToken, id) : [];
  const documentRefs = refsFromDocuments(documents);
  const policy = niche === 'property' ? documents.find((item) => item.documentType === 'property_policy') : null;
  const officeShopDocuments = isOfficeShop(niche) ? editOfficeShopDocuments(details, documentRefs) : null;
  let form = editForm(emptyForm(), niche, listing, details, officeShopDocuments);
  if (niche === 'hotel' && listing.supports_table_reservation === true) {
    const dining = await fetchDiningConfig(accessToken, id);
    const fields = { ...form.fields };
    if (dining.restaurant_name != null) fields['dining-restaurant-name'] = String(dining.restaurant_name);
    if (dining.opening_hours != null) fields['dining-opening-hours'] = String(dining.opening_hours);
    if (dining.tables_available != null) fields['dining-tables-available'] = String(dining.tables_available);
    form = { ...form, fields };
  }
  const availability = await client.from('availability').select('date').eq('listing_id', id);
  if (availability.error) throw availability.error;
  const savedDates = ((availability.data || []) as Array<{ date: string }>).map((item) => item.date);
  form = { ...form, availableDates: savedDates };
  return {
    form,
    documentRefs,
    edit: { existingPhotos, existingPolicyUrl: (policy && policy.downloadUrl) || null, documents: isOfficeShop(niche) ? documents : [], officeShopDocuments, savedDates },
  };
}

/** restoreListingDraftAfterUpgrade: the device copy, else the server copy, never a newer revision overwritten. */
async function restoreDraft(deps: StartupDeps, niche: Category, remote: RemoteDraft | null, pointer: { cacheKey?: string | null } | null, localSnapshot: DraftSnapshot | null,
  flags: Flags, paymentReturned: boolean, continuing: boolean): Promise<{ form: WizardForm | null; media: Partial<WizardMedia>; messages: Message[] }> {
  const { session, draftCache, hostId } = deps;
  const messages: Message[] = [];
  let snapshot: Partial<DraftSnapshot> | null = localSnapshot;
  let localConflict = false;
  let localServerRevision = 0;
  session.restoring = true;
  try {
    const cacheKey = remote ? `${hostId}:${remote.id}` : (pointer && pointer.cacheKey) || null;
    if (remote) {
      session.draftId = remote.id;
      session.cacheKey = cacheKey;
      session.listingId = remote.listing_id || null;
      session.revision = Number(remote.revision) || 0;
    }
    if (!snapshot && cacheKey && draftCache) {
      try { snapshot = await draftCache.load<DraftSnapshot>(cacheKey); } catch (error) { console.error('Unable to restore the local media cache:', error); }
    }
    const matchingCheckout = Boolean(snapshot && snapshot.checkoutState === true && remote && snapshot.hostId === hostId
      && snapshot.listingId === remote.listing_id && snapshot.category === remote.category);
    if (snapshot && (snapshot.hostId !== hostId || snapshot.category !== niche || (snapshot.cacheKey !== cacheKey && !matchingCheckout)
        || !Number.isFinite(snapshot.createdAt) || !snapshot.fields || typeof snapshot.fields !== 'object')) snapshot = null;
    if (snapshot && remote) {
      localServerRevision = Number.isInteger(snapshot.serverRevision) ? Number(snapshot.serverRevision) : 0;
      const serverRevision = Number(remote.revision) || 0;
      const sameFields = JSON.stringify(draftFormData(snapshot)) === JSON.stringify(remote.form_data || {});
      const sameMedia = JSON.stringify(draftMediaMetadata(snapshot)) === JSON.stringify(remote.media_metadata || []);
      if (localServerRevision < serverRevision && sameFields && sameMedia) {
        snapshot.serverRevision = serverRevision;
        snapshot.updatedAt = remote.updated_at || snapshot.updatedAt;
      } else if (localServerRevision !== serverRevision) {
        // Keep the device copy, but never send it over a newer server revision.
        localConflict = true;
        session.revisionConflict = true;
      }
      snapshot.serverMediaMetadata = remote.media_metadata || [];
    }
    if (!snapshot && remote && remote.form_data && cacheKey) snapshot = snapshotFromRemote(remote, hostId, cacheKey);
    // The older upgrade handoff is accepted only on a payment return.
    if (!snapshot && !continuing && paymentReturned) {
      try {
        const legacy = JSON.parse(window.sessionStorage.getItem(LEGACY_UPGRADE_DRAFT_KEY) || 'null') as Partial<DraftSnapshot> | null;
        if (legacy && legacy.category === niche && legacy.fields) {
          snapshot = legacy;
          window.sessionStorage.removeItem(LEGACY_UPGRADE_DRAFT_KEY);
          window.sessionStorage.removeItem(LEGACY_UPGRADE_KEY);
        }
      } catch (error) { console.warn('Ignoring an unreadable legacy listing draft:', error); }
    }
    if (!snapshot || snapshot.category !== niche || !snapshot.fields) {
      if (paymentReturned && flags.returnedPaymentVerified) {
        // Keep the paid listing's review reachable, but never publish an incomplete listing.
        flags.publishBlocked = true;
        messages.push({ text: 'Payment confirmed. Listing details could not be restored on this device, so publishing is paused. Restore the saved listing from My Profile or contact support.', error: true });
        return { form: { ...emptyForm(), currentStep: 5, furthestStep: 5 }, media: {}, messages };
      }
      messages.push({ text: 'This saved listing could not be restored. Its profile draft is still preserved; try Continue Listing again.', error: true });
      return { form: null, media: {}, messages };
    }
    if (snapshot.draftId) session.draftId = snapshot.draftId;
    if (snapshot.checkoutState) session.cacheKey = snapshot.cacheKey || session.cacheKey;
    if (snapshot.listingId && (!session.listingId || snapshot.listingId === session.listingId)) session.listingId = snapshot.listingId;

    const restored = restoreSnapshot(snapshot, niche);
    const step = continuing ? restored.form.currentStep : 5;
    const form: WizardForm = { ...restored.form, currentStep: step, furthestStep: Math.max(restored.form.furthestStep, step) };
    // Documents never go back into the form; only their uploaded references.
    const media: WizardMedia = { mediaFiles: restored.mediaFiles, documentRefs: restored.documentRefs, policyFile: null, officeShopFiles: { floorPlan: null, policy: null, documents: [] } };

    // Rewrite older device copies without private document files.
    const sanitized = captureSnapshot({ ...session.identity(), cacheKey: cacheKey || session.identity().cacheKey }, niche, form, media, effectivePriceUnit(niche, form.fields));
    sanitized.draftId = session.draftId;
    sanitized.checkoutState = snapshot.checkoutState === true;
    sanitized.serverMediaMetadata = snapshot.serverMediaMetadata || [];
    sanitized.mediaSelected = Boolean(snapshot.mediaSelected || restored.mediaFiles.length || sanitized.serverMediaMetadata.some((item) => item.kind === 'listing_media'));
    if (localConflict) { sanitized.serverRevision = localServerRevision; sanitized.updatedAt = snapshot.updatedAt || sanitized.updatedAt; }
    if (draftCache) await draftCache.save(sanitized);

    const uploadedCount = Object.values(restored.documentRefs).reduce((total, refs) => total + refs.length, 0);
    if (restored.mediaFiles.length || uploadedCount) messages.push({ text: 'Your saved listing, media, and securely uploaded documents have been restored.', error: false });
    else if ((snapshot.serverMediaMetadata || []).some((item) => item.kind === 'listing_media') || snapshot.mediaSelected) {
      messages.push({ text: 'Your listing details are restored. Reselect the saved photo or video files shown in My Profile; browsers keep media files only on this device.', error: false });
    }
    if (pendingDocumentSelections(snapshot) && !uploadedCount) messages.push({ text: 'Your listing details are restored, but selected documents were not uploaded yet. Please choose those files again before publishing.', error: true });
    if (localConflict) messages.push({ text: 'This device has a saved copy, and a newer version is in My Profile. The device copy is preserved and will not overwrite the newer draft.', error: true });
    return { form, media, messages };
  } finally {
    session.restoring = false;
  }
}
