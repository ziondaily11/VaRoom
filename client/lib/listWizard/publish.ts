import type { Category, Fields, PropertyPurpose, WizardForm } from './formState';
import { SHORT_STAY, checked, isOfficeShop, nightlyStayRules, splitListingArea, text } from './formState';
import type { OfficeShopKind, OfficeShopListingDetails } from './officeShop';
import { collectOfficeShopDetails, hydrateOfficeShopDetails, mergeOfficeShopPatch, officeShopConditions, officeShopPriceUnit } from './officeShop';
import { selectedAmenityKeys, setAmenityChecked } from './amenities';
import { defaultPriceUnit, priceUnitOptions } from './copy';
import type { DocumentRefs } from './drafts';
import { latestRef } from './api';

// What the wizard sends when it publishes (unchanged from the submit handler
// in legacy-pages/list.html), and how a listing being edited fills the form.

export const PAID_NICHES: Category[] = ['property', 'office', 'shop'];
export const isPaidNiche = (category: string | null | undefined) => PAID_NICHES.includes(category as Category);

/** The #price-unit value: office/shop follow the pricing basis; others keep a valid choice. */
export function effectivePriceUnit(category: Category, fields: Fields): string {
  if (isOfficeShop(category)) return officeShopConditions(fields, category as OfficeShopKind).priceUnit;
  const value = text(fields, 'price-unit');
  return priceUnitOptions(category).some((option) => option.value === value) ? value : defaultPriceUnit(category);
}

const isTableOnly = (category: Category, form: WizardForm) => category === 'hotel' && form.hotelListingMode === 'table';
export const hasStayDetails = (category: Category, form: WizardForm) => SHORT_STAY.includes(category) && !isTableOnly(category, form);

/** The listing row (POST /api/listings or PATCH /api/listings/:id). */
export function listingPayload(category: Category, form: WizardForm, isNew: boolean): Record<string, unknown> {
  const { fields } = form;
  const location = text(fields, 'location-text');
  const area = splitListingArea(location);
  const payload: Record<string, unknown> = {
    title: text(fields, 'title'), description: text(fields, 'caption'), property_description: text(fields, 'property-description'),
    location_text: location, country: 'Kenya',
  };
  if (area.neighborhood) payload.neighborhood = area.neighborhood;
  if (area.city) payload.city = area.city;
  // Share only the general area on the card; exact unit details stay private.
  if (isOfficeShop(category)) payload.address_visibility = 'after_inquiry';
  if (isNew) payload.category = category;
  if (category === 'hotel') {
    payload.supports_stay = form.hotelListingMode !== 'table';
    payload.supports_table_reservation = form.hotelListingMode === 'table' || form.hotelListingMode === 'both';
  }
  if (category === 'property') payload.listing_purpose = form.propertyPurpose;
  return payload;
}

/** The payment-draft shell's first fields (ensurePaymentDraft). */
export function shellPayload(category: Category, form: WizardForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    category, title: text(form.fields, 'title'), description: text(form.fields, 'caption'),
    property_description: text(form.fields, 'property-description'), location_text: text(form.fields, 'location-text'),
  };
  if (category === 'property') payload.listing_purpose = form.propertyPurpose;
  return payload;
}

const int = (value: string) => (value ? parseInt(value, 10) : null);

/** "Studio", "1 bedroom", "3 bedrooms". */
export const bedroomLabel = (count: number | null) => (count === null ? null : count === 0 ? 'Studio' : `${count} bedroom${count === 1 ? '' : 's'}`);

/** "Seats 80 · 150 standing", "Seats 80" or "150 standing". */
export function venueCapacityLabel(seated: number | null, standing: number | null): string | null {
  const parts = [seated ? `Seats ${seated}` : null, standing ? `${standing} standing` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * "The space" for stays and venues. Airbnbs: bedrooms, beds, bathrooms;
 * hotel rooms: beds and how many rooms of this type; venues: seated and
 * standing guests. size_or_type and max_guests (read by cards, chats and the
 * guest filter) follow from these numbers; an older free-text value stays
 * until the numbers are given.
 */
export function spaceDetails(category: Category, fields: Fields, sizeOrType: string | null, editMode: boolean): Record<string, unknown> {
  if (category === 'airbnb') {
    const bedrooms = int(text(fields, 'stay-bedrooms'));
    return {
      bedrooms, beds: int(text(fields, 'stay-beds')), bathrooms: int(text(fields, 'stay-bathrooms')),
      size_or_type: bedroomLabel(bedrooms) || sizeOrType,
    };
  }
  if (category === 'hotel') {
    const rooms = text(fields, 'hotel-rooms-available');
    return { beds: int(text(fields, 'stay-beds')), ...(rooms || editMode ? { units_available: int(rooms) } : {}) };
  }
  if (category === 'venue') {
    const seated = int(text(fields, 'venue-seated'));
    const standing = int(text(fields, 'venue-standing'));
    const largest = Math.max(seated || 0, standing || 0);
    return {
      seated_capacity: seated, standing_capacity: standing,
      ...(largest ? { max_guests: largest } : {}),
      size_or_type: venueCapacityLabel(seated, standing) || sizeOrType,
    };
  }
  return {};
}
const float = (value: string) => (value ? parseFloat(value) : null);

/** The office/shop details with the uploaded documents' ids merged in (uploadOfficeShopMedia). */
export function withOfficeShopDocuments(details: OfficeShopListingDetails, refs: DocumentRefs): OfficeShopListingDetails {
  const documents: Record<string, unknown> = { ...(details.documents || {}) };
  const floorPlan = latestRef(refs, 'floor_plan');
  const policy = latestRef(refs, 'commercial_policy');
  const management = refs.ownership_management || [];
  if (floorPlan) { documents.floor_plan_document_id = floorPlan.id; delete documents.floor_plan_path; }
  if (policy) { documents.policy_document_id = policy.id; delete documents.policy_path; }
  if (management.length) {
    const current = Array.isArray(documents.management_document_ids) ? (documents.management_document_ids as string[]) : [];
    documents.management_document_ids = Array.from(new Set(current.concat(management.map((ref) => ref.id))));
    delete documents.management_document_paths;
  }
  return { ...details, documents: documents as OfficeShopListingDetails['documents'] };
}

/** booking_details for the listing (listing_id left out; the PATCH names the listing). */
export function bookingDetailsFor(category: Category, form: WizardForm, editMode: boolean, officeShop: OfficeShopListingDetails | null): Record<string, unknown> {
  const { fields } = form;
  const details: Record<string, unknown> = {
    price_amount: parseFloat(text(fields, 'price-amount')) || 0,
    price_unit: effectivePriceUnit(category, fields) || 'month',
    size_or_type: category === 'property' ? (text(fields, 'property-bedroom-type') || null) : (text(fields, 'size-or-type') || null),
    amenities: selectedAmenityKeys(category, form.amenities),
  };
  const lease = () => {
    details.min_lease_months = int(text(fields, 'min-lease'));
    details.deposit_amount = float(text(fields, 'deposit-amount'));
    details.utilities_included = checked(fields, 'utilities-included');
  };
  if (isOfficeShop(category) && officeShop) {
    details.office_shop_details = officeShop;
    details.office_shop_accuracy_confirmed = checked(fields, 'os-accuracy-confirmed');
    details.price_amount = officeShop.pricing.amount;
    details.price_unit = officeShopPriceUnit(officeShop);
    details.size_or_type = officeShop.subtype;
    details.available_from = officeShop.lease.available_from;
    details.min_lease_months = officeShop.pricing.basis === 'daily_weekly_hourly' ? null : officeShop.lease.minimum_term;
    details.amenities = Object.keys(officeShop.amenities).filter((key) => officeShop.amenities[key as keyof typeof officeShop.amenities] === true);
  } else if (category === 'property') {
    const units = text(fields, 'property-units-available');
    details.property_type = text(fields, 'property-type') || null;
    details.bathrooms = int(text(fields, 'property-bathrooms'));
    if (units || editMode) details.units_available = int(units);
    details.available_from = text(fields, 'available-from') || null;
    const purpose: PropertyPurpose = form.propertyPurpose;
    if (purpose === 'sale') {
      details.sale_price_amount = float(text(fields, 'property-sale-price'));
      details.sale_price_mode = form.propertySalePriceMode;
      details.price_amount = details.sale_price_amount || 0;
      details.price_unit = 'month';
      if (editMode) { details.min_lease_months = null; details.deposit_amount = null; details.utilities_included = false; }
    } else if (purpose === 'both') {
      details.sale_price_amount = float(text(fields, 'property-sale-price'));
      details.sale_price_mode = form.propertySalePriceMode;
      lease();
    } else {
      if (editMode) { details.sale_price_amount = null; details.sale_price_mode = null; }
      lease();
    }
  } else if (hasStayDetails(category, form)) {
    details.max_guests = int(text(fields, 'max-guests'));
    Object.assign(details, spaceDetails(category, fields, details.size_or_type as string | null, editMode));
    details.min_stay_nights = int(text(fields, 'min-stay'));
    details.checkin_time = text(fields, 'checkin-time') || null;
    details.checkout_time = text(fields, 'checkout-time') || null;
    details.cleaning_fee = float(text(fields, 'cleaning-fee'));
    details.cancellation_policy = text(fields, 'cancellation-policy') || 'moderate';
    details.max_stay_nights = int(text(fields, 'max-stay'));
    details.min_notice_days = int(text(fields, 'min-notice'));
    details.max_advance_days = int(text(fields, 'max-advance'));
    details.instant_book = checked(fields, 'instant-book');
    // Rules the wizard no longer asks for this listing are cleared, so an old value cannot apply.
    if (!nightlyStayRules(category, String(details.price_unit))) { details.min_stay_nights = null; details.max_stay_nights = null; }
    if (details.price_unit === 'hour') details.instant_book = false;
    if (category === 'venue') { details.checkin_time = null; details.checkout_time = null; }
  } else {
    details.available_from = text(fields, 'available-from') || null;
    lease();
  }
  return details;
}

/** Whether booking_details are saved at all (a table-only hotel has none). */
export const savesBookingDetails = (category: Category, form: WizardForm) => !isTableOnly(category, form);

export function diningBody(category: Category, form: WizardForm): Record<string, unknown> | null {
  if (category !== 'hotel' || (form.hotelListingMode !== 'table' && form.hotelListingMode !== 'both')) return null;
  return {
    restaurant_name: form.hotelListingMode === 'table' ? text(form.fields, 'title') : text(form.fields, 'dining-restaurant-name'),
    caption: text(form.fields, 'caption'),
    location_text: text(form.fields, 'location-text'),
    opening_hours: text(form.fields, 'dining-opening-hours'),
    tables_available: Number(text(form.fields, 'dining-tables-available')),
  };
}

export interface PublicationState {
  category: Category;
  editMode: boolean;
  paymentVerified: boolean;
  hasActiveNichePlan: boolean;
  hasCurrentListingFee: boolean;
  /** A paid Silver / Gold listing not yet used: publishing uses it. */
  hasListingCredit: boolean;
  listingIsPaused: boolean;
  listingNeedsPublication: boolean;
}

/** A paid niche needs Silver, Gold (or a plan still running) before publishing. */
export const needsListingPayment = (state: PublicationState) => isPaidNiche(state.category)
  && !state.hasActiveNichePlan && !state.paymentVerified && !state.hasListingCredit && !(state.editMode && state.hasCurrentListingFee);

/**
 * While payment is needed: the Silver / Gold choice covers the step once the
 * allowance check has answered, Publish stays hidden, and when the check
 * failed, a note under the buttons instead.
 */
export function reviewActions(paymentNeeded: boolean, entitlementChecked: boolean): { showTierChoice: boolean; submitHidden: boolean; entitlementNote: boolean } {
  return { showTierChoice: paymentNeeded && entitlementChecked, submitHidden: paymentNeeded, entitlementNote: paymentNeeded && !entitlementChecked };
}

/**
 * Uploads the chosen media in order, skipping files an earlier attempt already
 * uploaded (a retry resumes). A failed file is counted, not thrown.
 */
export async function uploadPendingMedia(files: File[], uploaded: Set<File>, upload: (file: File, index: number) => Promise<unknown>,
  onProgress: (index: number, total: number) => void): Promise<{ uploadedCount: number; failedCount: number }> {
  let uploadedCount = 0;
  let failedCount = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    onProgress(index, files.length);
    if (uploaded.has(file)) { uploadedCount += 1; continue; }
    try {
      await upload(file, index);
      uploaded.add(file);
      uploadedCount += 1;
    } catch (error) {
      console.warn('Listing media upload failed:', error);
      failedCount += 1;
    }
  }
  return { uploadedCount, failedCount };
}

/** A new listing whose media didn't all upload is not activated (the host retries). */
export const mediaUploadBlocksPublish = (editMode: boolean, total: number, failedCount: number) => !editMode && total > 0 && failedCount > 0;

/** Whether publishing also sets the listing available (the server uses a Silver / Gold credit then). */
export function shouldActivate(state: PublicationState): boolean {
  const paid = isPaidNiche(state.category);
  const covered = state.hasActiveNichePlan || state.hasListingCredit;
  return state.paymentVerified
    || (!state.editMode && covered && paid)
    || (state.editMode && state.listingIsPaused && (state.hasCurrentListingFee || covered))
    || (state.editMode && covered && !state.hasCurrentListingFee && paid)
    || (!paid && (!state.editMode || state.listingNeedsPublication));
}

// ---------- Edit mode ----------

export interface EditListingRow {
  id: string; title?: string | null; description?: string | null; property_description?: string | null; location_text?: string | null;
  city?: string | null; neighborhood?: string | null; address_visibility?: string | null; listing_purpose?: string | null;
  supports_stay?: boolean | null; supports_table_reservation?: boolean | null;
}

export type EditDetailsRow = Record<string, unknown> & { office_shop_details?: Record<string, unknown> | null; amenities?: unknown };

/** loadEditListing: the listing and its booking details → the form. */
export function editForm(base: WizardForm, category: Category, listing: EditListingRow, detailsRow: EditDetailsRow | null, officeShopDocuments: Record<string, unknown> | null): WizardForm {
  const details = detailsRow || {};
  const fields: Fields = { ...base.fields };
  const set = (id: string, value: unknown) => { if (value !== undefined && value !== null) fields[id] = String(value); };
  set('title', listing.title); set('caption', listing.description); set('property-description', listing.property_description);
  set('location-text', listing.location_text); set('os-city', listing.city); set('os-neighborhood', listing.neighborhood);
  set('os-address-visibility', listing.address_visibility);
  set('price-amount', details.price_amount); set('price-unit', details.price_unit); set('size-or-type', details.size_or_type);
  if (category === 'property' && details.size_or_type) set('property-bedroom-type', details.size_or_type);
  if (category === 'property') set('property-type', details.property_type);
  set('property-bathrooms', details.bathrooms); set('max-guests', details.max_guests); set('min-stay', details.min_stay_nights);
  set('stay-bedrooms', details.bedrooms); set('stay-beds', details.beds); set('stay-bathrooms', details.bathrooms);
  if (category === 'hotel') set('hotel-rooms-available', details.units_available);
  set('venue-seated', details.seated_capacity); set('venue-standing', details.standing_capacity);
  set('checkin-time', details.checkin_time); set('checkout-time', details.checkout_time); set('cleaning-fee', details.cleaning_fee);
  set('cancellation-policy', details.cancellation_policy || 'moderate'); set('available-from', details.available_from);
  set('min-lease', details.min_lease_months); set('deposit-amount', details.deposit_amount);
  set('property-units-available', details.units_available); set('property-sale-price', details.sale_price_amount);
  set('dining-restaurant-name', details.restaurant_name); set('dining-opening-hours', details.opening_hours); set('dining-tables-available', details.tables_available);
  fields['utilities-included'] = details.utilities_included === true;
  set('max-stay', details.max_stay_nights); set('min-notice', details.min_notice_days); set('max-advance', details.max_advance_days);
  fields['instant-book'] = details.instant_book === true;
  let form: WizardForm = { ...base, fields };
  (Array.isArray(details.amenities) ? (details.amenities as string[]) : []).forEach((key) => { form.amenities = setAmenityChecked(form.amenities, key, true); });
  if (isOfficeShop(category)) {
    const stored = { ...(details.office_shop_details || {}), documents: officeShopDocuments || {} };
    form = mergeOfficeShopPatch(form, hydrateOfficeShopDetails(stored));
  }
  if (category === 'property') {
    const purpose = listing.listing_purpose
      || (details.sale_price_amount != null && Number(details.price_amount) > 0 ? 'both' : details.sale_price_amount != null ? 'sale' : 'rent');
    form.propertyPurpose = (['rent', 'sale', 'both'].includes(purpose) ? purpose : 'rent') as PropertyPurpose;
    form.propertySalePriceMode = details.sale_price_mode === 'starting' ? 'starting' : 'exact';
  }
  if (category === 'hotel') {
    const stay = listing.supports_stay !== false;
    const dining = listing.supports_table_reservation === true;
    form.hotelListingMode = stay && dining ? 'both' : dining ? 'table' : 'stay';
  }
  return form;
}

/** The stored office_shop_details.documents with the listing's current document ids (edit mode). */
export function editOfficeShopDocuments(details: EditDetailsRow | null, refs: DocumentRefs): Record<string, unknown> {
  const stored = details && details.office_shop_details && typeof details.office_shop_details === 'object'
    ? ((details.office_shop_details as Record<string, unknown>).documents as Record<string, unknown>) || {} : {};
  const documents: Record<string, unknown> = { ...stored };
  const floorPlan = refs.floor_plan || [];
  const policy = refs.commercial_policy || [];
  const management = refs.ownership_management || [];
  if (floorPlan.length) documents.floor_plan_document_id = floorPlan[floorPlan.length - 1].id;
  if (policy.length) documents.policy_document_id = policy[policy.length - 1].id;
  if (management.length) documents.management_document_ids = management.map((ref) => ref.id);
  return documents;
}

/** collectOfficeShopDetails for the publish step. */
export const officeShopDetailsFor = (category: Category, form: WizardForm, existingDocuments: Record<string, unknown> | null) => (
  isOfficeShop(category) ? collectOfficeShopDetails(form, category as OfficeShopKind, existingDocuments) : null);
