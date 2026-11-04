import type { Category, Fields, PropertyPurpose, WizardForm } from './formState';
import { SHORT_STAY, checked, isOfficeShop, splitListingArea, text } from './formState';
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
    details.min_stay_nights = int(text(fields, 'min-stay'));
    details.checkin_time = text(fields, 'checkin-time') || null;
    details.checkout_time = text(fields, 'checkout-time') || null;
    details.cleaning_fee = float(text(fields, 'cleaning-fee'));
    details.cancellation_policy = text(fields, 'cancellation-policy') || 'moderate';
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
  listingIsPaused: boolean;
  listingNeedsPublication: boolean;
}

/** A paid niche needs a fee or plan before publishing. */
export const needsListingPayment = (state: PublicationState) => isPaidNiche(state.category)
  && !state.hasActiveNichePlan && !state.paymentVerified && !(state.editMode && state.hasCurrentListingFee);

/** Whether publishing also sets the listing available (unchanged rule). */
export function shouldActivate(state: PublicationState): boolean {
  const paid = isPaidNiche(state.category);
  return state.paymentVerified
    || (!state.editMode && state.hasActiveNichePlan && paid)
    || (state.editMode && state.listingIsPaused && (state.hasCurrentListingFee || state.hasActiveNichePlan))
    || (state.editMode && state.hasActiveNichePlan && !state.hasCurrentListingFee && paid)
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
  set('property-bathrooms', details.bathrooms); set('max-guests', details.max_guests); set('min-stay', details.min_stay_nights);
  set('checkin-time', details.checkin_time); set('checkout-time', details.checkout_time); set('cleaning-fee', details.cleaning_fee);
  set('cancellation-policy', details.cancellation_policy || 'moderate'); set('available-from', details.available_from);
  set('min-lease', details.min_lease_months); set('deposit-amount', details.deposit_amount);
  set('property-units-available', details.units_available); set('property-sale-price', details.sale_price_amount);
  set('dining-restaurant-name', details.restaurant_name); set('dining-opening-hours', details.opening_hours); set('dining-tables-available', details.tables_available);
  fields['utilities-included'] = details.utilities_included === true;
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
