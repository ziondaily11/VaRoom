import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentRef, ListingDocument } from './policyDocuments';
import type { DocumentRefs, MediaMetadata, RemoteDraft } from './drafts';
import { listingDocumentMimeType } from './officeShop';

// The listing wizard's requests (unchanged from legacy-pages/list.html).
// Every call takes the current access token; the page reads it from the
// Supabase session right before each write, as list.html did.

type Json = Record<string, unknown>;

const readJson = (response: Response): Promise<Json> => response.json().catch(() => ({})) as Promise<Json>;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', ...bearer(token) });
const errorText = (result: Json, fallback: string) => (typeof result.error === 'string' && result.error) || fallback;

// ---------- Drafts ----------

export async function fetchRemoteDraft(token: string, draftId: string): Promise<RemoteDraft> {
  const response = await fetch(`/api/listing-drafts/${encodeURIComponent(draftId)}`, { headers: bearer(token) });
  const result = await readJson(response);
  if (!response.ok || !result.draft) throw new Error(errorText(result, 'Listing draft not found'));
  return result.draft as RemoteDraft;
}

/** A server draft, or null on any failure (used where its absence must not block anything). */
export async function tryFetchRemoteDraft(token: string, draftId: string): Promise<RemoteDraft | null> {
  try {
    const response = await fetch(`/api/listing-drafts/${encodeURIComponent(draftId)}`, { headers: bearer(token) });
    if (!response.ok) return null;
    const result = await readJson(response);
    return (result.draft as RemoteDraft) || null;
  } catch (error) {
    console.warn('Unable to load the latest server draft revision after checkout:', error);
    return null;
  }
}

export async function fetchRemoteDrafts(token: string): Promise<RemoteDraft[] | null> {
  const response = await fetch('/api/listing-drafts', { headers: bearer(token) });
  if (!response.ok) return null;
  const result = await response.json() as Json;
  return Array.isArray(result.drafts) ? (result.drafts as RemoteDraft[]) : null;
}

export type DraftSaveOutcome =
  | { ok: true; revision: number; updatedAt: string | null; mediaMetadata: MediaMetadata[] | null }
  | { ok: false; conflict: boolean; offline: boolean; message: string };

export async function putRemoteDraft(token: string, draftId: string, body: { category: string; form_data: Json; media_metadata: MediaMetadata[]; listing_id: string | null; revision: number }, keepalive: boolean): Promise<DraftSaveOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/listing-drafts/${encodeURIComponent(draftId)}`, {
      method: 'PUT', headers: jsonHeaders(token), keepalive, body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, conflict: false, offline: true, message: error instanceof Error ? error.message : String(error) };
  }
  const result = await readJson(response);
  if (!response.ok) {
    const conflict = response.status === 409 && result.code === 'LISTING_DRAFT_REVISION_CONFLICT';
    return { ok: false, conflict, offline: !conflict, message: errorText(result, String(response.status)) };
  }
  const draft = (result.draft || {}) as { revision?: number; updated_at?: string; media_metadata?: MediaMetadata[] };
  return { ok: true, revision: Number(draft.revision) || 0, updatedAt: draft.updated_at || null, mediaMetadata: draft.media_metadata || null };
}

export async function deleteRemoteDraft(token: string, draftId: string): Promise<boolean> {
  const response = await fetch(`/api/listing-drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE', headers: bearer(token) });
  return response.ok;
}

// ---------- Listing shell, payment, entitlements ----------

/** The payment-draft listing shell (POST /api/listings with payment_draft). */
export async function createListingShell(token: string, payload: Json): Promise<string> {
  const response = await fetch('/api/listings', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ ...payload, payment_draft: true }) });
  const result = await readJson(response);
  const listing = result.listing as { id?: string } | undefined;
  if (!response.ok || !listing || !listing.id) throw new Error(errorText(result, 'Unable to prepare your listing for checkout.'));
  return listing.id;
}

export async function deleteListingShell(token: string, listingId: string): Promise<boolean> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, { method: 'DELETE', headers: bearer(token) });
  return response.ok;
}

export interface VerifiedPayment { status: string; listing_id: string | null; payment_kind: string; niche?: string | null }

export const SESSION_EXPIRED_PAYMENT = 'Your session expired. Sign in again to check this payment.';

/**
 * Polls a returned Paystack reference (30 tries 2 s apart after a return, one
 * try once verified). A signed-out answer stops at once (list.html kept polling).
 */
export async function verifyReturnedPayment(token: string, reference: string, attempts: number, isSubscriptionReturn: boolean, wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<VerifiedPayment | null> {
  let payment: VerifiedPayment | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(`/api/billing/payments/${encodeURIComponent(reference)}`, { headers: bearer(token) });
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    if (response) {
      if (response.status === 401 || response.status === 403) throw new Error(SESSION_EXPIRED_PAYMENT);
      const result = await readJson(response);
      if (response.ok) payment = (result.payment as VerifiedPayment) || null;
    }
    if (payment && payment.status === 'succeeded' && payment.listing_id
        && (payment.payment_kind === 'listing' || (isSubscriptionReturn && payment.payment_kind !== 'listing'))) return payment;
    if (payment && ['failed', 'abandoned', 'refunded'].includes(payment.status)) return payment;
    if (attempt < attempts - 1) await wait(2000);
  }
  return payment;
}

interface EntitlementResult {
  active: boolean;
  subscription?: { status?: string; niche?: string } | null;
  canCreateAnotherListing?: { allowed?: boolean } | null;
}

/** Whether the host's plan covers this niche; throws when the allowance can't be confirmed. */
export async function fetchNichePlanActive(token: string, category: string): Promise<boolean> {
  const response = await fetch('/api/billing/entitlements', { headers: bearer(token) });
  if (!response.ok) throw new Error('Unable to confirm your listing allowance');
  const result = await readJson(response);
  const entitlement = result.entitlements as EntitlementResult | undefined;
  if (!entitlement || typeof entitlement.active !== 'boolean' || !entitlement.canCreateAnotherListing) throw new Error('Unable to confirm your listing allowance');
  const expectedNiche = category === 'property' ? 'property' : 'shops_offices';
  const allowance = entitlement.canCreateAnotherListing;
  return Boolean(entitlement.active && entitlement.subscription && entitlement.subscription.status === 'active'
    && entitlement.subscription.niche === expectedNiche && allowance && allowance.allowed);
}

export async function startListingCheckout(token: string, listingId: string): Promise<string> {
  const response = await fetch('/api/billing/listing-checkout', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ listing_id: listingId }) });
  const result = await readJson(response);
  if (!response.ok || !result.authorization_url || !result.reference) throw new Error(errorText(result, 'Unable to start Paystack checkout.'));
  return String(result.authorization_url);
}

// ---------- Documents ----------

export async function fetchListingDocuments(token: string, listingId: string): Promise<ListingDocument[]> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/documents`, { headers: bearer(token) });
  const result = await readJson(response);
  if (!response.ok) throw new Error(errorText(result, 'Unable to restore listing documents. Please try again before saving.'));
  return Array.isArray(result.documents) ? (result.documents as ListingDocument[]) : [];
}

const SINGLE_DOCUMENT_TYPES = ['property_policy', 'floor_plan', 'commercial_policy'];

const sameDocumentFile = (reference: DocumentRef, file: File) => reference.filename === file.name
  && Number(reference.fileSize) === Number(file.size) && Number(reference.lastModified || 0) === Number(file.lastModified || 0);

/**
 * Uploads one private listing document (init → PUT to R2 → complete; the
 * reservation is deleted when a step fails). A file already uploaded for
 * this type is reused. Returns the reference and the type's new refs.
 */
export async function uploadListingDocument(token: string, file: File, documentType: string, listingId: string, refs: DocumentRefs): Promise<{ reference: DocumentRef; refs: DocumentRefs }> {
  const mimeType = listingDocumentMimeType(file);
  const prior = Array.isArray(refs[documentType]) ? refs[documentType] : [];
  const existing = prior.find((reference) => sameDocumentFile(reference, file));
  if (existing && existing.id) return { reference: existing, refs };
  const initResponse = await fetch('/api/listing-documents/upload-init', {
    method: 'POST', headers: jsonHeaders(token),
    body: JSON.stringify({ listingId, documentType, filename: file.name, mimeType, fileSize: file.size }),
  });
  const init = await readJson(initResponse);
  const reserved = init.document as { id?: string } | undefined;
  const upload = init.upload as { uploadUrl?: string } | undefined;
  if (!initResponse.ok || !reserved || !reserved.id || !upload || !upload.uploadUrl) throw new Error(errorText(init, 'Unable to prepare this document upload.'));
  let completedId: string;
  try {
    const binary = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
    if (!binary.ok) throw new Error(`R2 rejected the document upload (${binary.status}).`);
    const completeResponse = await fetch(`/api/listing-documents/${encodeURIComponent(reserved.id)}/complete`, { method: 'POST', headers: bearer(token) });
    const complete = await readJson(completeResponse);
    const document = complete.document as { id?: string } | undefined;
    if (!completeResponse.ok || !document || !document.id) throw new Error(errorText(complete, 'The document could not be verified after upload.'));
    completedId = document.id;
  } catch (uploadError) {
    try {
      await fetch(`/api/listing-documents/${encodeURIComponent(reserved.id)}`, { method: 'DELETE', headers: bearer(token) });
    } catch (_) { console.warn('The incomplete document upload will be cleaned up after its authorization expires.'); }
    throw uploadError;
  }
  const reference: DocumentRef = { id: completedId, documentType, filename: file.name, fileSize: file.size, lastModified: file.lastModified || 0, mimeType };
  return { reference, refs: { ...refs, [documentType]: SINGLE_DOCUMENT_TYPES.includes(documentType) ? [reference] : [...prior, reference] } };
}

export const latestRef = (refs: DocumentRefs, type: string): DocumentRef | null => {
  const list = refs[type];
  return Array.isArray(list) && list.length ? list[list.length - 1] : null;
};

/** Groups /documents rows into refs by type (edit mode). */
export function refsFromDocuments(documents: ListingDocument[]): DocumentRefs {
  const refs: DocumentRefs = {};
  documents.forEach((item) => {
    if (!item || !item.id || !item.documentType) return;
    (refs[item.documentType] = refs[item.documentType] || []).push({
      id: item.id, documentType: item.documentType, filename: String(item.filename || ''), fileSize: Number(item.fileSize) || 0, lastModified: 0, mimeType: String(item.mimeType || ''),
    });
  });
  return refs;
}

// ---------- Media ----------

export const MAX_MEDIA = 6;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// WEBM is listed in the page's copy and accepted by the video service; list.html left it out here by mistake.
export const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
export const isVideoFile = (file: { type?: string }) => Boolean(file.type && file.type.startsWith('video/'));

/** Adds chosen files: the type, size, count and duplicate rules, with list.html's messages. */
export function addMediaFiles(current: File[], incoming: File[]): { files: File[]; error: string | null } {
  const files = current.slice();
  let error: string | null = null;
  for (const file of incoming) {
    if (files.length >= MAX_MEDIA) { error = `You can add up to ${MAX_MEDIA} photos or videos.`; break; }
    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) { error = `"${file.name}" isn't a supported photo or video type.`; continue; }
    if (!isVideoFile(file) && file.size > MAX_IMAGE_BYTES) { error = `"${file.name}" is over 5MB.`; continue; }
    if (files.some((item) => item.name === file.name && item.size === file.size)) continue;
    files.push(file);
  }
  return { files, error };
}

const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(video.duration)) resolve(video.duration);
      else reject(new Error('Unable to read video duration'));
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read video duration')); };
    video.src = url;
  });
}

function imageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    if (typeof window.createImageBitmap === 'function') {
      window.createImageBitmap(file).then((bitmap) => {
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        resolve(dimensions);
      }).catch(() => resolve({ width: null, height: null }));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null }); };
    image.onerror = () => { URL.revokeObjectURL(url); resolve({ width: null, height: null }); };
    image.src = url;
  });
}

/** A listing video through R2 (60 s at most). */
export async function uploadListingVideo(token: string, file: File, listingId: string): Promise<string> {
  const durationSeconds = await videoDuration(file);
  if (durationSeconds > 60) throw new Error('Videos must be 60 seconds or less.');
  const base = `/api/properties/${encodeURIComponent(listingId)}/videos`;
  const initResponse = await fetch(`${base}/upload-init`, {
    method: 'POST', headers: jsonHeaders(token),
    body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size, durationSeconds }),
  });
  const init = await readJson(initResponse);
  if (!initResponse.ok) throw new Error(errorText(init, 'Video upload could not start.'));
  const mediaId = String(init.mediaId || '');
  const authorization = (init.uploadAuthorization || {}) as { uploadUrl?: string; contentType?: string };
  if (!authorization.uploadUrl) throw new Error('Video upload did not return a signed storage URL.');
  const uploadResponse = await fetch(authorization.uploadUrl, { method: 'PUT', headers: { 'Content-Type': authorization.contentType || file.type }, body: file });
  if (!uploadResponse.ok) throw new Error('Video upload to Cloudflare R2 failed.');
  const completeResponse = await fetch(`${base}/${encodeURIComponent(mediaId)}/complete`, {
    method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ uploadId: init.uploadId }),
  });
  const complete = await readJson(completeResponse);
  if (!completeResponse.ok) throw new Error(errorText(complete, 'Video upload could not be finalized.'));
  return mediaId;
}

/** A listing photo: storage upload, then its listing_photos row. */
export async function uploadListingPhoto(client: SupabaseClient, hostId: string, file: File, listingId: string, index: number): Promise<void> {
  const path = `${hostId}/${listingId}/${Date.now()}_${index}_${sanitizeFilename(file.name)}`;
  const dimensions = await imageDimensions(file);
  const { data, error } = await client.storage.from('listing-photos').upload(path, file, { upsert: false });
  if (error || !data) throw error || new Error('Photo upload failed');
  const { error: rowError } = await client.from('listing_photos').insert({ listing_id: listingId, storage_path: data.path, width: dimensions.width, height: dimensions.height });
  if (rowError) throw rowError;
}

// ---------- Publish ----------

export async function saveListing(token: string, listingId: string | null, payload: Json): Promise<string | null> {
  const response = await fetch(listingId ? `/api/listings/${encodeURIComponent(listingId)}` : '/api/listings', {
    method: listingId ? 'PATCH' : 'POST', headers: jsonHeaders(token), body: JSON.stringify(payload),
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(errorText(result, 'Unable to publish listing'));
  const listing = result.listing as { id?: string } | undefined;
  return (listing && listing.id) || listingId;
}

export async function saveBookingDetails(token: string, listingId: string, details: Json, editMode: boolean): Promise<void> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
    method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify({ booking_details: details }),
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(errorText(result, editMode ? 'Unable to update booking details' : 'Unable to save booking details'));
}

export async function saveDiningConfig(token: string, listingId: string, body: Json): Promise<void> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/dining-config`, { method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify(body) });
  const result = await readJson(response);
  if (!response.ok) throw new Error(errorText(result, 'Unable to save dining configuration'));
}

export async function fetchDiningConfig(token: string, listingId: string): Promise<{ restaurant_name?: string; opening_hours?: string; tables_available?: number }> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/dining-config`, { headers: bearer(token) });
  const result = await readJson(response);
  if (!response.ok) throw new Error(errorText(result, 'Unable to load dining settings.'));
  return (result.diningConfig || {}) as { restaurant_name?: string; opening_hours?: string; tables_available?: number };
}

export async function activateListing(token: string, listingId: string): Promise<void> {
  const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/status`, {
    method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify({ status: 'available' }),
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(errorText(result, 'Payment is confirmed, but this listing could not be activated yet.'));
}
