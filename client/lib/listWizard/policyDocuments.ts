// A property listing's policy document in the wizard: find the current one
// to preview, and remove it. Ported from public/js/listing-policy-preview.js
// and public/js/listing-policy-removal.js with the same requests and wording.

export interface ListingDocument { id: string; documentType?: string; filename?: string; mimeType?: string; fileSize?: number; downloadUrl?: string }

export interface DocumentRef { id: string; documentType: string; filename: string; fileSize: number; lastModified: number; mimeType: string }

export const UNAVAILABLE = 'This document is no longer available. Please refresh the listing and try again.';

async function readPolicies(listingId: string, accessToken: string, fetchFn: typeof fetch, fallback: string): Promise<ListingDocument[]> {
  const response = await fetchFn(`/api/listings/${encodeURIComponent(listingId)}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string; documents?: unknown };
  if (!response.ok) throw new Error(result.error || fallback);
  return (Array.isArray(result.documents) ? (result.documents as ListingDocument[]) : []).filter((item) => item && item.documentType === 'property_policy');
}

/** The newest property policy's address and name (the address is short-lived). */
export async function resolveCurrentPolicyPreview(listingId: string | null, accessToken: string | null, fetchFn: typeof fetch = fetch): Promise<{ url: string; filename: string }> {
  if (!listingId || !accessToken) throw new Error(UNAVAILABLE);
  const policies = await readPolicies(listingId, accessToken, fetchFn, UNAVAILABLE);
  const policy = policies[policies.length - 1];
  if (!policy || !policy.downloadUrl) throw new Error(UNAVAILABLE);
  return { url: policy.downloadUrl, filename: String(policy.filename || 'Property policy document') };
}

/** What the wizard shows for the attached policy after a removal. */
export interface PolicyFormState { documentRefs: DocumentRef[]; existingPolicyUrl: string | null; filename: string; visible: boolean }

export function policyFormState(policy: ListingDocument | null): PolicyFormState {
  const reference: DocumentRef | null = policy ? {
    id: policy.id,
    documentType: 'property_policy',
    filename: String(policy.filename || ''),
    fileSize: Number(policy.fileSize) || 0,
    lastModified: 0,
    mimeType: String(policy.mimeType || ''),
  } : null;
  return {
    documentRefs: reference ? [reference] : [],
    existingPolicyUrl: (policy && policy.downloadUrl) || null,
    filename: reference ? reference.filename : '',
    visible: Boolean(reference),
  };
}

export interface RemovalResult { removed: boolean; alreadyUnavailable: boolean; currentPolicy: ListingDocument | null; formState: PolicyFormState }

/**
 * Removes the policy attached now. If it was retired meanwhile (404), reads
 * again and reports what is attached, never deleting a different document.
 */
export async function removeCurrentPolicyDocument(listingId: string | null, accessToken: string | null, fetchFn: typeof fetch = fetch): Promise<RemovalResult> {
  if (!listingId || !accessToken) throw new Error('Please sign in again before removing this document.');
  const policies = await readPolicies(listingId, accessToken, fetchFn, 'Unable to check the attached policy document.');
  const current = policies.length ? policies[policies.length - 1] : null;
  if (!current) return { removed: false, alreadyUnavailable: true, currentPolicy: null, formState: policyFormState(null) };

  const response = await fetchFn(`/api/listing-documents/${encodeURIComponent(current.id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = (await response.json().catch(() => ({}))) as { removed?: boolean; error?: string };
  if (response.status === 204 || (response.status === 202 && result.removed === true)) {
    return { removed: true, alreadyUnavailable: false, currentPolicy: null, formState: policyFormState(null) };
  }
  if (response.status === 404) {
    const again = await readPolicies(listingId, accessToken, fetchFn, 'Unable to check the attached policy document.');
    const currentPolicy = again.length ? again[again.length - 1] : null;
    return { removed: false, alreadyUnavailable: true, currentPolicy, formState: policyFormState(currentPolicy) };
  }
  throw new Error(result.error || 'Unable to remove this policy document. Please try again.');
}
