'use strict';

(function(root){

  async function readCurrentPolicy(listingId, accessToken, request){
    const response = await request('/api/listings/' + encodeURIComponent(listingId) + '/documents', {
      headers: { Authorization: 'Bearer ' + accessToken },
      cache: 'no-store',
    });
    const result = await response.json().catch(function(){ return {}; });
    if (!response.ok) throw new Error(result.error || 'Unable to check the attached policy document.');
    const policies = (Array.isArray(result.documents) ? result.documents : []).filter(function(item){
      return item && item.documentType === 'property_policy';
    });
    return policies.length ? policies[policies.length - 1] : null;
  }

  async function removeCurrentPolicyDocument(listingId, accessToken, fetchImpl, formState){
    if (!listingId || !accessToken) throw new Error('Please sign in again before removing this document.');
    const request = fetchImpl || root.fetch.bind(root);
    const current = await readCurrentPolicy(listingId, accessToken, request);
    if (!current) {
      if (formState) applyCurrentPolicyToFormState(formState, null);
      return { removed: false, alreadyUnavailable: true, currentPolicy: null, formState: formState };
    }

    const response = await request('/api/listing-documents/' + encodeURIComponent(current.id), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    const result = await response.json().catch(function(){ return {}; });
    if (response.status === 204 || (response.status === 202 && result.removed === true)) {
      if (formState) applyCurrentPolicyToFormState(formState, null);
      return { removed: true, alreadyUnavailable: false, currentPolicy: null, formState: formState };
    }
    if (response.status === 404) {
      // The exact document read above may have been retired concurrently.
      // Refresh before changing the form, and never issue a delete for a
      // different document discovered during reconciliation.
      const currentPolicy = await readCurrentPolicy(listingId, accessToken, request);
      if (formState) applyCurrentPolicyToFormState(formState, currentPolicy);
      return {
        removed: false,
        alreadyUnavailable: true,
        currentPolicy: currentPolicy,
        formState: formState,
      };
    }
    throw new Error(result.error || 'Unable to remove this policy document. Please try again.');
  }

  function applyCurrentPolicyToFormState(state, policy){
    const reference = policy ? {
      id: policy.id,
      documentType: 'property_policy',
      filename: String(policy.filename || ''),
      fileSize: Number(policy.fileSize) || 0,
      lastModified: 0,
      mimeType: String(policy.mimeType || ''),
    } : null;
    state.documentRefs = reference ? [reference] : [];
    state.existingPolicyUrl = policy && policy.downloadUrl || null;
    state.filename = reference ? reference.filename : '';
    state.visible = Boolean(reference);
    return state;
  }

  root.VaRoomListingPolicyRemoval = {
    removeCurrentPolicyDocument: removeCurrentPolicyDocument,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VaRoomListingPolicyRemoval;
})(typeof globalThis !== 'undefined' ? globalThis : window);
