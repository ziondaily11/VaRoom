(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VaRoomBookingPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const RULE_LABELS = {
    fitout: 'Fit-out or renovation', signage: 'Signage', subletting: 'Subletting or assignment',
    restoration: 'Restoration on exit', noise_limits: 'Operating hour or noise limits', visitor_policy: 'Visitor policy'
  };
  const VALUE_LABELS = {
    allowed: 'Allowed', not_allowed: 'Not allowed', landlord_consent: 'Allowed with landlord consent',
    landlord_approval: 'Subject to landlord approval', to_confirm: 'To confirm', not_confirmed: 'Not confirmed',
    tenant_must_restore: 'Tenant must restore', not_required: 'Not required', strict: 'Strict',
    moderate: 'Moderate', flexible: 'Flexible', non_refundable: 'Non-refundable'
  };
  const USE_LABELS = {
    office_or_professional: 'Office or professional', general_retail: 'General retail', fashion: 'Fashion',
    electronics: 'Electronics', salon_or_beauty: 'Salon or beauty', food_or_cafe: 'Food or cafe',
    pharmacy_or_healthcare: 'Pharmacy or healthcare', creative_studio: 'Creative studio', other: 'Other',
    not_sure_renter_to_confirm: 'Not sure — renter to confirm'
  };
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function(character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }
  function cleanText(value) { return typeof value === 'string' && value.trim() ? value.trim() : ''; }
  function displayValue(value, labels) {
    const text = cleanText(value);
    return text ? (labels[text] || (text.includes(' ') ? text : text.replace(/_/g, ' ').replace(/\b\w/g, function(letter) { return letter.toUpperCase(); }))) : '';
  }
  function validDocument(documents, type) {
    if (!Array.isArray(documents)) return null;
    return documents.find(function(document) {
      return document && typeof document === 'object' && document.documentType === type
        && typeof document.downloadUrl === 'string' && /^https?:\/\//i.test(document.downloadUrl);
    }) || null;
  }
  function previewableMime(mimeType) {
    return mimeType === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType);
  }
  function buildListingPolicyHtml(category, details, documents, documentsLoaded) {
    details = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
    documents = Array.isArray(documents) ? documents : [];
    const rows = [];
    let documentType = null;
    if (category === 'property') {
      documentType = 'property_policy';
    } else if (category === 'office' || category === 'shop') {
      const office = details.office_shop_details && typeof details.office_shop_details === 'object' && !Array.isArray(details.office_shop_details)
        ? details.office_shop_details : {};
      const rules = office.rules && typeof office.rules === 'object' && !Array.isArray(office.rules) ? office.rules : {};
      Object.keys(RULE_LABELS).forEach(function(key) {
        const value = displayValue(rules[key], VALUE_LABELS);
        if (value) rows.push({ label: RULE_LABELS[key], value: value });
      });
      if (Array.isArray(rules.permitted_uses)) {
        const uses = rules.permitted_uses.map(function(use) { return displayValue(use, USE_LABELS); }).filter(Boolean);
        if (uses.length) rows.push({ label: 'Permitted business uses', value: uses.join(', ') });
      }
      documentType = 'commercial_policy';
    } else return '';

    const policyDocument = validDocument(documents, documentType);
    const textHtml = rows.map(function(row) {
      return '<div class="property-policy-row"><dt>' + escapeHtml(row.label) + '</dt><dd>' + escapeHtml(row.value) + '</dd></div>';
    }).join('');
    let documentHtml = '';
    if (policyDocument) {
      const filename = cleanText(policyDocument.filename) || 'Property policy document';
      const previewUrl = typeof policyDocument.previewUrl === 'string' && /^https?:\/\//i.test(policyDocument.previewUrl) ? policyDocument.previewUrl : '';
      const mimeType = cleanText(policyDocument.mimeType);
      documentHtml = '<button type="button" class="property-policy-link property-policy-preview-trigger" data-policy-preview data-document-id="' + escapeHtml(policyDocument.id || '') + '" data-preview-url="' + escapeHtml(previewUrl) + '" data-download-url="' + escapeHtml(policyDocument.downloadUrl) + '" data-mime-type="' + escapeHtml(mimeType) + '" data-document-title="' + escapeHtml(filename) + '" aria-label="Preview property policy document: ' + escapeHtml(filename) + '">' +
        '<svg class="property-policy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>' +
        '<span class="property-policy-name">' + escapeHtml(filename) + '<span class="property-policy-action">' + (previewableMime(mimeType) ? 'Preview policy document' : 'Preview unavailable — select to see options') + '</span></span></button>';
    }
    const knownInformation = rows.length > 0 || Boolean(policyDocument);
    const emptyHtml = knownInformation ? '' : (documentsLoaded
      ? '<p class="property-policy-empty">No property policies provided.</p>'
      : '<p class="property-policy-empty">Policy information is temporarily unavailable.</p>');
    return '<section class="property-policy" aria-labelledby="property-policy-heading">' +
      '<h2 class="property-policy-title" id="property-policy-heading"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>Property Policies</h2>' +
      (textHtml ? '<dl class="property-policy-details">' + textHtml + '</dl>' : '') + documentHtml +
      '<div class="property-policy-preview" data-policy-preview-panel hidden role="region" aria-label="Policy document preview"><div class="property-policy-preview-header"><strong data-policy-preview-title></strong><button type="button" class="property-policy-preview-close" data-policy-preview-close aria-label="Close document preview">Close</button></div><p class="property-policy-preview-status" data-policy-preview-status role="status" aria-live="polite"></p><div class="property-policy-preview-content" data-policy-preview-content></div></div>' + emptyHtml + '</section>';
  }
  function buildListingDocumentsHtml(category, documents) {
    if (category !== 'office' && category !== 'shop') return '';
    const available = [
      { type: 'floor_plan', label: 'Floor plan' },
      { type: 'ownership_management', label: 'Ownership and management' }
    ].map(function(item) {
      const document = validDocument(documents, item.type);
      if (!document) return '';
      const filename = cleanText(document.filename) || item.label;
      return '<a class="property-policy-link" href="' + escapeHtml(document.downloadUrl) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(item.label.toLowerCase()) + ': ' + escapeHtml(filename) + '">' +
        '<svg class="property-policy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>' +
        '<span class="property-policy-name">' + escapeHtml(filename) + '<span class="property-policy-action">' + escapeHtml(item.label) + '</span></span></a>';
    }).filter(Boolean);
    if (!available.length) return '';
    return '<section class="property-policy" aria-labelledby="listing-documents-heading">' +
      '<h2 class="property-policy-title" id="listing-documents-heading">Documents</h2>' + available.join('') + '</section>';
  }
  return { buildListingPolicyHtml: buildListingPolicyHtml, buildListingDocumentsHtml: buildListingDocumentsHtml };
});
