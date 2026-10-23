'use strict';

(function(root){
  async function resolveCurrentPolicyPreview(listingId, accessToken, fetchImpl){
    if (!listingId || !accessToken) throw new Error('This document is no longer available. Please refresh the listing and try again.');
    const request = fetchImpl || root.fetch.bind(root);
    const response = await request('/api/listings/' + encodeURIComponent(listingId) + '/documents', {
      headers: { Authorization: 'Bearer ' + accessToken },
      cache: 'no-store',
    });
    const result = await response.json().catch(function(){ return {}; });
    if (!response.ok) throw new Error(result.error || 'This document is no longer available. Please refresh the listing and try again.');
    const documents = Array.isArray(result.documents) ? result.documents : [];
    const policies = documents.filter(function(item){ return item && item.documentType === 'property_policy'; });
    const policy = policies[policies.length - 1];
    if (!policy || !policy.downloadUrl) throw new Error('This document is no longer available. Please refresh the listing and try again.');
    return { url: policy.downloadUrl, filename: String(policy.filename || 'Property policy document') };
  }

  root.VaRoomListingPolicyPreview = { resolveCurrentPolicyPreview: resolveCurrentPolicyPreview };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VaRoomListingPolicyPreview;
})(typeof globalThis !== 'undefined' ? globalThis : window);
