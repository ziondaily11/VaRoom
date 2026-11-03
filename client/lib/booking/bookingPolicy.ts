import type { ListingDocument } from './bookingListing';

// Property and commercial policies, and commercial documents, on the booking
// page. Ported from public/js/booking-policy.js; it returned HTML, this
// returns what to show and components/booking renders it.

const RULE_LABELS: Record<string, string> = {
  fitout: 'Fit-out or renovation', signage: 'Signage', subletting: 'Subletting or assignment',
  restoration: 'Restoration on exit', noise_limits: 'Operating hour or noise limits', visitor_policy: 'Visitor policy',
};
const VALUE_LABELS: Record<string, string> = {
  allowed: 'Allowed', not_allowed: 'Not allowed', landlord_consent: 'Allowed with landlord consent',
  landlord_approval: 'Subject to landlord approval', to_confirm: 'To confirm', not_confirmed: 'Not confirmed',
  tenant_must_restore: 'Tenant must restore', not_required: 'Not required', strict: 'Strict',
  moderate: 'Moderate', flexible: 'Flexible', non_refundable: 'Non-refundable',
};
const USE_LABELS: Record<string, string> = {
  office_or_professional: 'Office or professional', general_retail: 'General retail', fashion: 'Fashion',
  electronics: 'Electronics', salon_or_beauty: 'Salon or beauty', food_or_cafe: 'Food or cafe',
  pharmacy_or_healthcare: 'Pharmacy or healthcare', creative_studio: 'Creative studio', other: 'Other',
  not_sure_renter_to_confirm: 'Not sure — renter to confirm',
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');

function displayValue(value: unknown, labels: Record<string, string>): string {
  const text = cleanText(value);
  return text ? (labels[text] || (text.includes(' ') ? text : text.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))) : '';
}

function validDocument(documents: ListingDocument[], type: string): ListingDocument | null {
  if (!Array.isArray(documents)) return null;
  return documents.find((document) => isRecord(document) && document.documentType === type
    && typeof document.downloadUrl === 'string' && /^https?:\/\//i.test(document.downloadUrl)) || null;
}

const previewableMime = (mimeType: string) => mimeType === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType);

export interface PolicyDocument {
  filename: string;
  /** In-app preview (PDF and images); null shows "Preview unavailable". */
  openUrl: string | null;
  downloadUrl: string | null;
}

export interface ListingPolicy {
  rows: Array<{ label: string; value: string }>;
  document: PolicyDocument | null;
  /** Shown when nothing is known: no policies, or not loaded. */
  empty: string | null;
}

/** Policies for property and office/shop listings; null for other categories. */
export function listingPolicy(category: string | null, detailsValue: unknown, documentsValue: unknown, documentsLoaded: boolean): ListingPolicy | null {
  const details = isRecord(detailsValue) ? detailsValue : {};
  const documents = Array.isArray(documentsValue) ? (documentsValue as ListingDocument[]) : [];
  const rows: Array<{ label: string; value: string }> = [];
  let documentType: string;
  if (category === 'property') {
    documentType = 'property_policy';
  } else if (category === 'office' || category === 'shop') {
    const office = isRecord(details.office_shop_details) ? details.office_shop_details : {};
    const rules = isRecord(office.rules) ? office.rules : {};
    Object.keys(RULE_LABELS).forEach((key) => {
      const value = displayValue(rules[key], VALUE_LABELS);
      if (value) rows.push({ label: RULE_LABELS[key], value });
    });
    if (Array.isArray(rules.permitted_uses)) {
      const uses = rules.permitted_uses.map((use) => displayValue(use, USE_LABELS)).filter(Boolean);
      if (uses.length) rows.push({ label: 'Permitted business uses', value: uses.join(', ') });
    }
    documentType = 'commercial_policy';
  } else return null;

  const policyDocument = validDocument(documents, documentType);
  let document: PolicyDocument | null = null;
  if (policyDocument) {
    const mimeType = cleanText(policyDocument.mimeType);
    const hasId = typeof policyDocument.id === 'string' && Boolean(policyDocument.id);
    const canPreview = previewableMime(mimeType) && hasId;
    const downloadUrl = hasId ? `/api/listing-documents/${encodeURIComponent(policyDocument.id as string)}/download` : policyDocument.downloadUrl;
    document = {
      filename: cleanText(policyDocument.filename) || 'Property policy document',
      openUrl: canPreview ? `/api/listing-documents/${encodeURIComponent(policyDocument.id as string)}/preview` : null,
      downloadUrl: typeof downloadUrl === 'string' && (downloadUrl.startsWith('/api/') || /^https?:\/\//i.test(downloadUrl)) ? downloadUrl : null,
    };
  }
  const known = rows.length > 0 || Boolean(document);
  return {
    rows,
    document,
    empty: known ? null : (documentsLoaded ? 'No property policies provided.' : 'Policy information is temporarily unavailable.'),
  };
}

export interface CommercialDocument { label: string; filename: string; url: string }

/** Floor plan and ownership documents for office/shop listings. */
export function commercialDocuments(category: string | null, documentsValue: unknown): CommercialDocument[] {
  if (category !== 'office' && category !== 'shop') return [];
  const documents = Array.isArray(documentsValue) ? (documentsValue as ListingDocument[]) : [];
  return [
    { type: 'floor_plan', label: 'Floor plan' },
    { type: 'ownership_management', label: 'Ownership and management' },
  ].flatMap((item) => {
    const document = validDocument(documents, item.type);
    return document ? [{ label: item.label, filename: cleanText(document.filename) || item.label, url: document.downloadUrl as string }] : [];
  });
}
