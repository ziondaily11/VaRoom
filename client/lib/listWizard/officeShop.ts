// The office and shop commercial form of the listing wizard (migrated from
// renderOfficeShopFields, updateOfficeShopConditions, collectOfficeShopDetails,
// hydrateOfficeShopDetails and the document inputs in legacy-pages/list.html).
//
// Controls with an element id live in `fields[id]` like every other wizard
// control. The id-less ones:
//   - amenity checkboxes (`data-os-key`)  -> form.officeShopAmenitySelections
//   - permitted uses (`data-os-use`)       -> form.officeShopPermittedUses
//   - compulsory charge rows               -> form.officeShopCharges
//   - layout checkboxes (`data-os-group="os-office-layout"` / `"os-shop-layout"`)
//     -> fields['os-office-layout'] / fields['os-shop-layout'], the checked
//        layout keys comma-separated in option order. No element has those
//        ids, so the legacy page ignores them when it restores `fields`; it
//        restores layouts from the controls[] entries officeShopControls()
//        produces.
//
// Option values, labels and the JSON collectOfficeShopDetails() produces are
// unchanged from list.html.

import type { CapturedControl, Fields, OfficeShopCharge, WizardForm } from './formState';

export type OfficeShopKind = 'office' | 'shop';
export type Option = readonly [value: string, label: string];
type Bag = Record<string, unknown>;

const bag = (value: unknown): Bag => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : {});

/** "Not sure — renter to confirm" → "not_sure_renter_to_confirm" (osChecks in list.html). */
export const optionKey = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ---------------------------------------------------------------------------
// Options

export const OFFICE_SUBTYPES: Option[] = [['private_office', 'Private office'], ['shared_office', 'Shared office'], ['serviced_office', 'Serviced office'], ['coworking_desk', 'Coworking desk'], ['meeting_room', 'Meeting room']];
export const SHOP_SUBTYPES: Option[] = [['street_front_shop', 'Street-front shop'], ['mall_unit', 'Mall unit'], ['showroom', 'Showroom'], ['studio', 'Studio']];

export interface AmenityGroup { title: string; choices: Option[] }

/** The hidden `.office-shop-amenities-store` checkboxes; `title` is also each checkbox's `data-os-category`. */
export const OFFICE_SHOP_AMENITY_GROUPS: AmenityGroup[] = [
  { title: 'Power', choices: [['mains_supply', 'Main supply'], ['backup_generator', 'Backup generator'], ['ups', 'UPS']] },
  { title: 'Internet', choices: [['fibre', 'Fibre available'], ['wifi_included', 'Wi-Fi included in the rent'], ['tenant_internet', 'Tenant arranges own internet']] },
  { title: 'Water and washrooms', choices: [['reliable_water', 'Reliable water supply'], ['borehole', 'Borehole'], ['private_washroom', 'Private washroom'], ['shared_washroom', 'Shared washroom'], ['drainage', 'Drainage connection']] },
  { title: 'Security', choices: [['guards', 'Guards'], ['cctv', 'CCTV'], ['controlled_entry', 'Controlled entry'], ['alarm', 'Alarm'], ['lighting', 'Security lighting']] },
  { title: 'Building services', choices: [['lift', 'Lift'], ['accessibility', 'Accessibility features'], ['ac_ventilation', 'AC or ventilation'], ['natural_light', 'Natural light'], ['cleaning', 'Cleaning'], ['maintenance', 'Maintenance'], ['waste_collection', 'Waste collection'], ['reception', 'Reception'], ['shared_kitchen', 'Shared kitchen'], ['meeting_rooms', 'Meeting rooms']] },
];
export const OFFICE_SHOP_AMENITY_KEYS: string[] = OFFICE_SHOP_AMENITY_GROUPS.flatMap((group) => group.choices.map((choice) => choice[0]));

const withKeys = (labels: string[]): Option[] => labels.map((label) => [optionKey(label), label] as const);
export const OFFICE_LAYOUTS: Option[] = withKeys(['Open plan', 'Private offices', 'Meeting room', 'Reception', 'Server / IT room', 'Storage', 'Kitchenette']);
export const SHOP_LAYOUTS: Option[] = withKeys(['Sales floor', 'Stockroom', 'Counter / display area', 'Back room', 'Loading / storage']);
export const PERMITTED_USES: Option[] = withKeys(['Office or professional', 'General retail', 'Fashion', 'Electronics', 'Salon or beauty', 'Food or cafe', 'Pharmacy or healthcare', 'Creative studio', 'Other', 'Not sure — renter to confirm']);

export type LayoutGroup = 'os-office-layout' | 'os-shop-layout';
export const LAYOUT_OPTIONS: Record<LayoutGroup, Option[]> = { 'os-office-layout': OFFICE_LAYOUTS, 'os-shop-layout': SHOP_LAYOUTS };

export const CHARGE_TYPES: Option[] = [['parking', 'Parking'], ['access_cards', 'Access cards'], ['cleaning', 'Cleaning'], ['internet', 'Internet'], ['agent_fee', 'Agent fee'], ['legal_registration', 'Legal or registration'], ['signage', 'Signage'], ['building_fee', 'Building fee']];
export const CHARGE_FREQUENCIES: Option[] = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annual', 'Annual'], ['one_off', 'One-off']];

const CHOOSE: Option = ['', 'Choose one'];
const NOT_CONFIRMED_YES_NO: Option[] = [['not_confirmed', 'Not confirmed'], ['yes', 'Yes'], ['no', 'No']];

/** Every select's options (by element id), in list.html order. The subtype and pricing basis depend on the kind. */
export function selectOptions(id: string, kind: OfficeShopKind): Option[] {
  switch (id) {
    case 'os-subtype': return [CHOOSE, ...(kind === 'office' ? OFFICE_SUBTYPES : SHOP_SUBTYPES)];
    case 'os-pricing-basis': return [CHOOSE, ['whole_month', 'Whole unit, per month'], ['whole_year', 'Whole unit, per year'], ['per_area', 'Per sq ft or per m²'], ['per_desk', 'Per desk or person'], ['daily_weekly_hourly', 'Daily, weekly or hourly'], ...(kind === 'shop' ? [['turnover', 'Turnover rent'] as const] : [])];
    default: return SELECTS[id] || [];
  }
}

const SELECTS: Record<string, Option[]> = {
  'os-role': [CHOOSE, ['owner', 'Owner'], ['authorized_manager', 'Authorised property manager'], ['agent', 'Agent']],
  'os-after-hours': [['not_confirmed', 'Not confirmed'], ['24_7', '24/7'], ['business_hours', 'Business hours']],
  'os-parking-cost': [['not_confirmed', 'Not confirmed'], ['free', 'Free'], ['paid', 'Paid']],
  'os-fitout-rule': [CHOOSE, ['allowed', 'Allowed'], ['landlord_consent', 'Allowed with landlord consent'], ['not_allowed', 'Not allowed'], ['to_confirm', 'To confirm']],
  'os-signage': [['to_confirm', 'To confirm'], ['allowed', 'Allowed'], ['landlord_approval', 'Subject to landlord approval'], ['not_allowed', 'Not allowed']],
  'os-subletting': [['to_confirm', 'To confirm'], ['allowed', 'Allowed'], ['not_allowed', 'Not allowed']],
  'os-restoration': [['to_confirm', 'To confirm'], ['tenant_must_restore', 'Tenant must restore'], ['not_required', 'Not required']],
  'os-area-unit': [CHOOSE, ['sq_ft', 'sq ft'], ['m2', 'm²']],
  'os-area-measure': [CHOOSE, ['usable', 'Usable'], ['rentable', 'Rentable'], ['estimate', 'Estimate']],
  'os-fitout-status': [CHOOSE, ['shell_core', 'Shell-and-core'], ['partly_fitted', 'Partly fitted'], ['fitted', 'Fitted'], ['furnished', 'Furnished']],
  'os-street-frontage': NOT_CONFIRMED_YES_NO,
  'os-display-windows': NOT_CONFIRMED_YES_NO,
  'os-loading-access': NOT_CONFIRMED_YES_NO,
  'os-monthly-payment': [['to_confirm', 'To confirm'], ['yes', 'Yes'], ['no', 'No']],
  'os-area-period': [['month', 'Per month'], ['year', 'Per year']],
  'os-service-charge': [CHOOSE, ['included', 'Included'], ['not_included', 'Not included'], ['not_confirmed', 'Not confirmed']],
  'os-service-frequency': [CHOOSE, ...CHARGE_FREQUENCIES],
  'os-utilities': [CHOOSE, ['included', 'Included'], ['metered', 'Metered separately'], ['fixed_fee', 'Fixed monthly fee'], ['tenant_arranges', 'Tenant arranges'], ['not_confirmed', 'Not confirmed']],
  'os-tax': [CHOOSE, ['included', 'Included'], ['added', 'Added on top'], ['not_applicable', 'Not applicable'], ['needs_confirmation', 'Needs confirmation']],
  'os-rent-increases': [['not_confirmed', 'Not confirmed'], ['none', 'None'], ['annual', 'Annual escalation'], ['stepped', 'Stepped'], ['index_linked', 'Index-linked']],
  'os-payment-frequency': [CHOOSE, ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Annually'], ['custom', 'Custom']],
  'os-viewing-required': [CHOOSE, ['yes', 'Yes'], ['no', 'No']],
  'os-renewal': [['to_confirm', 'To confirm'], ['yes', 'Yes'], ['no', 'No']],
};

/** A value that is not one of the options shows (and reads) as the first option, as a browser select does. */
export function optionValue(value: string, options: Option[]): string {
  return options.some((option) => option[0] === value) ? value : (options[0] ? options[0][0] : '');
}

/** The value a select shows for the stored field. */
export function selectValue(fields: Fields, id: string, kind: OfficeShopKind): string {
  const value = fields[id];
  return optionValue(typeof value === 'string' ? value : '', selectOptions(id, kind));
}

// ---------------------------------------------------------------------------
// Kind-specific controls

// Rendered for both kinds but hidden for the other one (list.html always
// rendered #os-office-space and #os-shop-space). Their values stay in state
// when the host switches kind but read as untouched controls.
const OFFICE_SPACE_IDS = ['os-capacity', 'os-desks', 'os-private-rooms', 'os-furniture', 'os-office-layout'];
const SHOP_SPACE_IDS = ['os-customer-area', 'os-storage-area', 'os-street-frontage', 'os-frontage-width', 'os-display-windows', 'os-loading-access', 'os-foot-traffic', 'os-nearby-anchors', 'os-shop-layout'];
// Only rendered for shops.
const SHOP_ONLY_IDS = ['os-customer-parking', 'os-signage'];

const inapplicable = (id: string, kind: OfficeShopKind): boolean => (kind === 'office'
  ? SHOP_SPACE_IDS.includes(id) || SHOP_ONLY_IDS.includes(id)
  : OFFICE_SPACE_IDS.includes(id));

/** What list.html's osValue(id) read: the control's value trimmed ('' when the control is not rendered). */
function readValue(fields: Fields, id: string, kind: OfficeShopKind): string {
  if (kind === 'office' && SHOP_ONLY_IDS.includes(id)) return '';
  const stored = inapplicable(id, kind) ? '' : fields[id];
  const value = typeof stored === 'string' ? stored : '';
  const options = selectOptions(id, kind);
  return (options.length ? optionValue(value, options) : value).trim();
}

const readNumber = (fields: Fields, id: string, kind: OfficeShopKind): number | null => {
  const value = readValue(fields, id, kind);
  return value === '' ? null : Number(value);
};

const readChecked = (fields: Fields, id: string, kind: OfficeShopKind): boolean => !inapplicable(id, kind) && fields[id] === true;

// ---------------------------------------------------------------------------
// Layouts

/** The checked layout keys of a group (kept in fields[group]). */
export function layoutKeys(fields: Fields, group: LayoutGroup): string[] {
  const value = fields[group];
  const stored = typeof value === 'string' ? value.split(',') : [];
  return LAYOUT_OPTIONS[group].map((option) => option[0]).filter((key) => stored.includes(key));
}

/** fields[group] after toggling one layout checkbox. */
export function toggleLayout(fields: Fields, group: LayoutGroup, key: string, on: boolean): string {
  const keys = new Set(layoutKeys(fields, group));
  if (on) keys.add(key); else keys.delete(key);
  return LAYOUT_OPTIONS[group].map((option) => option[0]).filter((item) => keys.has(item)).join(',');
}

/** Stored layout labels (or keys) → the fields[group] value. */
function layoutFieldFromLabels(group: LayoutGroup, labels: unknown[]): string {
  const wanted = labels.map((label) => String(label).trim());
  return LAYOUT_OPTIONS[group].filter((option) => wanted.includes(option[1]) || wanted.includes(option[0])).map((option) => option[0]).join(',');
}

// ---------------------------------------------------------------------------
// Conditions (updateOfficeShopConditions)

export interface OfficeShopConditions {
  /** The pricing basis the select shows. */
  basis: string;
  /** Which pricing extras show (each is `hidden` otherwise). */
  yearlyExtra: boolean;
  areaExtra: boolean;
  deskExtra: boolean;
  shortExtra: boolean;
  turnoverExtra: boolean;
  /** `required` on #os-area-measure. */
  areaMeasureRequired: boolean;
  /** #os-business-hours-fields shows and its two times are required. */
  businessHours: boolean;
  /** `required` on #os-desks: shared/serviced offices and coworking desks (list.html set it at step 4). */
  desksRequired: boolean;
  /** `required` on #os-capacity. */
  capacityRequired: boolean;
  /** Label and placeholder of #os-min-term. */
  minTermLabel: string;
  minTermPlaceholder: string;
  /** The legacy #price-unit value for this basis. */
  priceUnit: string;
}

export function officeShopConditions(fields: Fields, kind: OfficeShopKind): OfficeShopConditions {
  const basis = readValue(fields, 'os-pricing-basis', kind);
  const shortRate = basis === 'daily_weekly_hourly';
  return {
    basis,
    yearlyExtra: basis === 'whole_year',
    areaExtra: basis === 'per_area',
    deskExtra: basis === 'per_desk',
    shortExtra: shortRate,
    turnoverExtra: basis === 'turnover',
    areaMeasureRequired: basis === 'per_area',
    businessHours: readValue(fields, 'os-after-hours', kind) === 'business_hours',
    desksRequired: kind === 'office' && ['shared_office', 'serviced_office', 'coworking_desk'].includes(readValue(fields, 'os-subtype', kind)),
    capacityRequired: kind === 'office',
    minTermLabel: shortRate ? 'Minimum booking duration' : 'Minimum lease term',
    minTermPlaceholder: shortRate ? 'Number of days, weeks or hours' : 'Months',
    priceUnit: officeShopPriceUnit({ pricing: { basis }, space: { area_unit: readValue(fields, 'os-area-unit', kind) } }),
  };
}

/** Step 3 check for business-hours access (unchanged message from list.html). */
export function officeShopBusinessHoursError(fields: Fields, kind: OfficeShopKind): string | null {
  if (readValue(fields, 'os-after-hours', kind) !== 'business_hours') return null;
  const from = readValue(fields, 'os-operating-hours-from', kind);
  const to = readValue(fields, 'os-operating-hours-to', kind);
  return from && to && to <= from ? 'End time must be later than the start time.' : null;
}

/** The listing's price_unit for an office/shop pricing basis. */
export function officeShopPriceUnit(details: { pricing: { basis?: string | null }; space: { area_unit?: string | null } }): string {
  const basis = details.pricing.basis;
  if (basis === 'whole_year') return 'year';
  if (basis === 'per_area') return details.space.area_unit === 'm2' ? 'm2' : 'sq_ft';
  if (basis === 'per_desk') return 'desk';
  if (basis === 'daily_weekly_hourly') return 'day';
  if (basis === 'turnover') return 'turnover';
  return 'month';
}

// ---------------------------------------------------------------------------
// Charges

/** A new charge row (list.html's addOfficeShopCharge with no charge). */
export const blankCharge = (): OfficeShopCharge => ({ type: 'parking', amount: '', frequency: 'monthly' });

/** A stored compulsory charge → a charge row. */
export function chargeRow(charge: unknown): OfficeShopCharge {
  const value = bag(charge);
  return {
    type: optionValue(String(value.type || 'parking'), CHARGE_TYPES),
    amount: value.amount == null ? '' : String(value.amount),
    frequency: optionValue(String(value.frequency || 'monthly'), CHARGE_FREQUENCIES),
  };
}

export interface CollectedCharge { type: string; amount: number; frequency: string }

/** Rows without an amount are dropped. */
export function collectOfficeShopCharges(charges: OfficeShopCharge[]): CollectedCharge[] {
  return charges.filter((charge) => charge.amount !== '').map((charge) => ({
    type: optionValue(charge.type, CHARGE_TYPES),
    amount: Number(charge.amount),
    frequency: optionValue(charge.frequency, CHARGE_FREQUENCIES),
  }));
}

// ---------------------------------------------------------------------------
// Collect (collectOfficeShopDetails)

export interface OfficeShopListingDetails {
  subtype: string;
  role: string;
  /** Every amenity key → checked, then the notes. */
  amenities: Record<string, boolean | string | null>;
  location: { building_name: string };
  space: {
    area: number | null; area_unit: string; area_measure: string | null; fitout_status: string; floor_level: string | null;
    room_count: number | null; ceiling_height: string | null; capacity: number | null; desks: number | null; office_layout: string[];
    private_rooms: number | null; furniture_included: boolean; customer_area: number | null; storage_area: number | null; shop_layout: string[];
    street_frontage: string | null; frontage_width: string | null; display_windows: string | null; loading_access: string | null;
    foot_traffic: string | null; nearby_anchors: string | null;
  };
  parking: { spaces: number | null; allocated: boolean; visitor: boolean; customer: boolean; cost: string; paid_amount: number | null };
  rules: { permitted_uses: string[]; fitout: string; signage: string | null; subletting: string; restoration: string; noise_limits: string | null };
  pricing: { basis: string; amount: number | null; area_period: string | null; monthly_payment: string | null; desk_included: string | null; short_pricing_note: string | null; turnover_threshold: string | null };
  costs: {
    service_charge: string; service_amount: number | null; service_frequency: string | null; utilities: string; utilities_amount: number | null;
    tax: string; security_deposit: string; advance_rent: string | null; compulsory_charges: CollectedCharge[]; rent_increases: string | null;
  };
  lease: {
    available_from: string; minimum_term: number | null; payment_frequency: string; viewing_required: string; preferred_term: number | null;
    renewal: string | null; notice_period: string | null; lock_in: string | null; viewing_availability: string | null; payment_methods: string | null;
  };
  documents: Record<string, unknown> & { documents_on_request: boolean };
}

type CollectForm = Pick<WizardForm, 'fields' | 'officeShopAmenitySelections' | 'officeShopPermittedUses' | 'officeShopCharges'>;

/**
 * The listing's office_shop_details. `existingDocuments` is the stored
 * office_shop_details.documents of the listing being edited (document ids
 * are merged in by the upload step).
 */
export function collectOfficeShopDetails(form: CollectForm, kind: OfficeShopKind, existingDocuments?: Record<string, unknown> | null): OfficeShopListingDetails {
  const fields = form.fields;
  const value = (id: string) => readValue(fields, id, kind);
  const orNull = (id: string) => value(id) || null;
  const num = (id: string) => readNumber(fields, id, kind);
  const on = (id: string) => readChecked(fields, id, kind);
  const layout = (group: LayoutGroup) => (inapplicable(group, kind) ? [] : layoutKeys(fields, group)
    .map((key) => { const option = LAYOUT_OPTIONS[group].find((item) => item[0] === key); return option ? option[1] : key; }));

  const checks: Record<string, boolean | string | null> = {};
  OFFICE_SHOP_AMENITY_KEYS.forEach((key) => { checks[key] = form.officeShopAmenitySelections[key] === true; });
  const uses = PERMITTED_USES.map((option) => option[0]).filter((key) => form.officeShopPermittedUses.includes(key));

  return {
    subtype: value('os-subtype'),
    role: value('os-role'),
    amenities: Object.assign(checks, {
      power_note: orNull('os-power-note'),
      internet_note: orNull('os-internet-note'),
      after_hours: value('os-after-hours') || 'not_confirmed',
      operational_accessible_hours: value('os-after-hours') === 'business_hours'
        ? [value('os-operating-hours-from'), value('os-operating-hours-to')].filter(Boolean).join('-') || null
        : null,
      accessibility_note: orNull('os-accessibility-note'),
    }),
    location: { building_name: value('os-building') },
    space: {
      area: num('os-area'), area_unit: value('os-area-unit'), area_measure: orNull('os-area-measure'), fitout_status: value('os-fitout-status'), floor_level: orNull('os-floor-level'),
      room_count: num('os-room-count'), ceiling_height: orNull('os-ceiling-height'), capacity: num('os-capacity'), desks: num('os-desks'), office_layout: layout('os-office-layout'),
      private_rooms: num('os-private-rooms'), furniture_included: on('os-furniture'), customer_area: num('os-customer-area'), storage_area: num('os-storage-area'), shop_layout: layout('os-shop-layout'),
      street_frontage: orNull('os-street-frontage'), frontage_width: orNull('os-frontage-width'), display_windows: orNull('os-display-windows'), loading_access: orNull('os-loading-access'),
      foot_traffic: orNull('os-foot-traffic'), nearby_anchors: orNull('os-nearby-anchors'),
    },
    parking: { spaces: num('os-parking-spaces'), allocated: on('os-parking-allocated'), visitor: on('os-visitor-parking'), customer: on('os-customer-parking'), cost: value('os-parking-cost') || 'not_confirmed', paid_amount: num('os-parking-paid-amount') },
    rules: { permitted_uses: uses, fitout: value('os-fitout-rule'), signage: orNull('os-signage'), subletting: value('os-subletting'), restoration: value('os-restoration'), noise_limits: orNull('os-noise-limits') },
    pricing: { basis: value('os-pricing-basis'), amount: num('os-price-amount'), area_period: orNull('os-area-period'), monthly_payment: orNull('os-monthly-payment'), desk_included: orNull('os-desk-included'), short_pricing_note: orNull('os-short-pricing-note'), turnover_threshold: orNull('os-turnover-threshold') },
    costs: {
      service_charge: value('os-service-charge'), service_amount: num('os-service-amount'), service_frequency: orNull('os-service-frequency'), utilities: value('os-utilities'), utilities_amount: num('os-utilities-amount'),
      tax: value('os-tax'), security_deposit: value('os-deposit'), advance_rent: orNull('os-advance-rent'), compulsory_charges: collectOfficeShopCharges(form.officeShopCharges), rent_increases: orNull('os-rent-increases'),
    },
    lease: {
      available_from: value('os-available-from'), minimum_term: num('os-min-term'), payment_frequency: value('os-payment-frequency'), viewing_required: value('os-viewing-required'), preferred_term: num('os-preferred-term'),
      renewal: orNull('os-renewal'), notice_period: orNull('os-notice-period'), lock_in: orNull('os-lock-in'), viewing_availability: orNull('os-viewing-availability'), payment_methods: orNull('os-payment-methods'),
    },
    documents: Object.assign({}, existingDocuments || {}, { documents_on_request: on('os-documents-on-request') }),
  };
}

/** The office/shop amenities summary line (selected labels joined by " · "), '' when none. */
export function officeShopAmenitySummary(selections: Record<string, boolean>): string {
  return OFFICE_SHOP_AMENITY_GROUPS.flatMap((group) => group.choices)
    .filter((choice) => selections[choice[0]] === true).map((choice) => choice[1]).join(' · ');
}

// ---------------------------------------------------------------------------
// Hydrate (edit mode) and restore

/** Office/shop parts of the form, to merge with mergeOfficeShopPatch(). */
export interface OfficeShopPatch {
  fields?: Fields;
  officeShopAmenitySelections?: Record<string, boolean>;
  officeShopPermittedUses?: string[];
  officeShopCharges?: OfficeShopCharge[];
}

/** Fields are merged key by key, amenity selections likewise; permitted uses and charges are replaced. */
export function mergeOfficeShopPatch(form: WizardForm, patch: OfficeShopPatch): WizardForm {
  return {
    ...form,
    fields: patch.fields ? { ...form.fields, ...patch.fields } : form.fields,
    officeShopAmenitySelections: patch.officeShopAmenitySelections ? { ...form.officeShopAmenitySelections, ...patch.officeShopAmenitySelections } : form.officeShopAmenitySelections,
    officeShopPermittedUses: patch.officeShopPermittedUses || form.officeShopPermittedUses,
    officeShopCharges: patch.officeShopCharges || form.officeShopCharges,
  };
}

/**
 * A stored office_shop_details → the form (list.html's hydrateOfficeShopDetails;
 * also restores the layout checkboxes, which list.html lost in edit mode).
 * Missing values leave their field untouched.
 */
export function hydrateOfficeShopDetails(stored: unknown): OfficeShopPatch {
  const details = bag(stored);
  const fields: Fields = {};
  const set = (id: string, value: unknown) => { if (value !== undefined && value !== null) fields[id] = String(value); };

  set('os-subtype', details.subtype); set('os-role', details.role);
  set('os-building', bag(details.location).building_name);

  const space = bag(details.space);
  [['os-area', 'area'], ['os-area-unit', 'area_unit'], ['os-area-measure', 'area_measure'], ['os-fitout-status', 'fitout_status'], ['os-floor-level', 'floor_level'], ['os-room-count', 'room_count'],
    ['os-ceiling-height', 'ceiling_height'], ['os-capacity', 'capacity'], ['os-desks', 'desks'], ['os-private-rooms', 'private_rooms'], ['os-customer-area', 'customer_area'], ['os-storage-area', 'storage_area'],
    ['os-street-frontage', 'street_frontage'], ['os-frontage-width', 'frontage_width'], ['os-display-windows', 'display_windows'], ['os-loading-access', 'loading_access'], ['os-foot-traffic', 'foot_traffic'],
    ['os-nearby-anchors', 'nearby_anchors']].forEach(([id, key]) => set(id, space[key]));
  if (Array.isArray(space.office_layout)) fields['os-office-layout'] = layoutFieldFromLabels('os-office-layout', space.office_layout);
  if (Array.isArray(space.shop_layout)) fields['os-shop-layout'] = layoutFieldFromLabels('os-shop-layout', space.shop_layout);
  if (space.furniture_included === true) fields['os-furniture'] = true;

  const parking = bag(details.parking);
  set('os-parking-spaces', parking.spaces); set('os-parking-cost', parking.cost); set('os-parking-paid-amount', parking.paid_amount);
  fields['os-parking-allocated'] = parking.allocated === true;
  fields['os-visitor-parking'] = parking.visitor === true;
  fields['os-customer-parking'] = parking.customer === true;

  const rules = bag(details.rules);
  set('os-fitout-rule', rules.fitout); set('os-signage', rules.signage); set('os-subletting', rules.subletting); set('os-restoration', rules.restoration); set('os-noise-limits', rules.noise_limits);
  const uses = Array.isArray(rules.permitted_uses) ? rules.permitted_uses.map(String).filter((key) => PERMITTED_USES.some((option) => option[0] === key)) : [];

  const pricing = bag(details.pricing);
  set('os-pricing-basis', pricing.basis); set('os-price-amount', pricing.amount); set('os-area-period', pricing.area_period); set('os-monthly-payment', pricing.monthly_payment);
  set('os-desk-included', pricing.desk_included); set('os-short-pricing-note', pricing.short_pricing_note); set('os-turnover-threshold', pricing.turnover_threshold);

  const costs = bag(details.costs);
  set('os-service-charge', costs.service_charge); set('os-service-amount', costs.service_amount); set('os-service-frequency', costs.service_frequency); set('os-utilities', costs.utilities);
  set('os-utilities-amount', costs.utilities_amount); set('os-tax', costs.tax); set('os-deposit', costs.security_deposit); set('os-advance-rent', costs.advance_rent); set('os-rent-increases', costs.rent_increases);
  const charges = Array.isArray(costs.compulsory_charges) ? costs.compulsory_charges.map(chargeRow) : [];

  const lease = bag(details.lease);
  set('os-available-from', lease.available_from); set('os-min-term', lease.minimum_term); set('os-payment-frequency', lease.payment_frequency); set('os-viewing-required', lease.viewing_required);
  set('os-preferred-term', lease.preferred_term); set('os-renewal', lease.renewal); set('os-notice-period', lease.notice_period); set('os-lock-in', lease.lock_in);
  set('os-viewing-availability', lease.viewing_availability); set('os-payment-methods', lease.payment_methods);

  const amenities = bag(details.amenities);
  const selections: Record<string, boolean> = {};
  Object.keys(amenities).forEach((key) => { if (OFFICE_SHOP_AMENITY_KEYS.includes(key)) selections[key] = amenities[key] === true; });
  set('os-power-note', amenities.power_note); set('os-internet-note', amenities.internet_note); set('os-after-hours', amenities.after_hours);
  const storedHours = String(amenities.operational_accessible_hours || '');
  const hoursMatch = storedHours.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
  if (hoursMatch) { set('os-operating-hours-from', hoursMatch[1]); set('os-operating-hours-to', hoursMatch[2]); }
  else if (/^\d{2}:\d{2}$/.test(storedHours)) set('os-operating-hours-from', storedHours);
  set('os-accessibility-note', amenities.accessibility_note);

  fields['os-documents-on-request'] = bag(details.documents).documents_on_request === true;

  return { fields, officeShopAmenitySelections: selections, officeShopPermittedUses: uses, officeShopCharges: charges };
}

// ---------------------------------------------------------------------------
// Legacy draft controls[]

type OsKeyGroup = 'os-amenities' | LayoutGroup;
// The order list.html rendered the data-os-key checkboxes in: the amenity
// store (media step) before the office and shop layouts (pricing step).
const OS_KEY_GROUPS: Array<[OsKeyGroup, string[]]> = [
  ['os-amenities', OFFICE_SHOP_AMENITY_KEYS],
  ['os-office-layout', OFFICE_LAYOUTS.map((option) => option[0])],
  ['os-shop-layout', SHOP_LAYOUTS.map((option) => option[0])],
];

/**
 * A legacy draft's controls[] → the office/shop state of its id-less
 * checkboxes. Entries are matched by osKey / osUse; a key that appears in
 * more than one group ("reception" is both an amenity and an office layout)
 * is told apart by `name` when officeShopControls() wrote it, otherwise by
 * its order (list.html captured controls in document order).
 */
export function officeShopFromControls(controls: CapturedControl[] | null | undefined): OfficeShopPatch {
  const selections: Record<string, boolean> = {};
  const layouts: Partial<Record<LayoutGroup, Set<string>>> = {};
  const seen: Record<string, number> = {};
  let uses: string[] | undefined;
  (Array.isArray(controls) ? controls : []).forEach((control) => {
    if (!control || control.id) return;
    if (control.osKey) {
      const named = OS_KEY_GROUPS.find(([group, keys]) => group === control.name && keys.includes(control.osKey));
      const candidates = OS_KEY_GROUPS.filter(([, keys]) => keys.includes(control.osKey));
      const occurrence = seen[control.osKey] || 0;
      seen[control.osKey] = occurrence + 1;
      const match = named || candidates[occurrence];
      if (!match) return;
      const group = match[0];
      if (group === 'os-amenities') selections[control.osKey] = control.checked === true;
      else {
        const set = layouts[group] || (layouts[group] = new Set<string>());
        if (control.checked === true) set.add(control.osKey);
      }
    } else if (control.osUse) {
      uses = uses || [];
      if (control.checked === true && PERMITTED_USES.some((option) => option[0] === control.osUse)) uses.push(control.osUse);
    }
  });
  const fields: Fields = {};
  (Object.keys(layouts) as LayoutGroup[]).forEach((group) => {
    const chosen = layouts[group];
    fields[group] = LAYOUT_OPTIONS[group].map((option) => option[0]).filter((key) => Boolean(chosen && chosen.has(key))).join(',');
  });
  const patch: OfficeShopPatch = {};
  if (Object.keys(fields).length) patch.fields = fields;
  if (Object.keys(selections).length) patch.officeShopAmenitySelections = selections;
  if (uses) patch.officeShopPermittedUses = uses;
  return patch;
}

/**
 * controls[] entries for the id-less office/shop checkboxes, so the legacy
 * page restores a draft the React wizard saved. Layouts come first: the
 * legacy restore matches an osKey to the first checkbox with that key, so
 * the amenity "reception" entry must be applied after the layout one.
 * `formIndex` is -1 (these entries are always matched by osKey / osUse);
 * charge rows are not included because both pages restore them from
 * officeShopCharges.
 */
export function officeShopControls(form: Pick<WizardForm, 'fields' | 'officeShopAmenitySelections' | 'officeShopPermittedUses'>): CapturedControl[] {
  const entry = (name: string, osKey: string, osUse: string, isChecked: boolean): CapturedControl => (
    { formIndex: -1, id: '', name, nameIndex: 0, osKey, osUse, type: 'checkbox', value: 'on', checked: isChecked });
  const layouts = (['os-office-layout', 'os-shop-layout'] as LayoutGroup[]).flatMap((group) => {
    const keys = layoutKeys(form.fields, group);
    return LAYOUT_OPTIONS[group].map((option) => entry(group, option[0], '', keys.includes(option[0])));
  });
  const amenities = OFFICE_SHOP_AMENITY_KEYS.map((key) => entry('os-amenities', key, '', form.officeShopAmenitySelections[key] === true));
  const uses = PERMITTED_USES.map((option) => entry('', '', option[0], form.officeShopPermittedUses.includes(option[0])));
  return [...layouts, ...amenities, ...uses];
}

// ---------------------------------------------------------------------------
// Documents

export const DOCUMENT_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp,.gif';
export const DOCUMENT_TYPE_ERROR = 'Choose a PDF, JPEG, PNG, WebP, or GIF document.';
export const DOCUMENT_SIZE_ERROR = 'Documents must be no larger than 15 MB.';

export interface DocumentFileLike { name: string; type?: string; size: number }

/** A listing document's MIME type; throws with the message shown to the host when the file is not accepted. */
export function listingDocumentMimeType(file: DocumentFileLike | null | undefined): string {
  const extension = (String((file && file.name) || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const byExtension: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const mimeType = (file && file.type) || byExtension[extension];
  const accepted: Record<string, string[]> = { 'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/gif': ['gif'] };
  if (!mimeType || !accepted[mimeType] || !accepted[mimeType].includes(extension)) throw new Error(DOCUMENT_TYPE_ERROR);
  if (!file || !file.size || file.size > 15 * 1024 * 1024) throw new Error(DOCUMENT_SIZE_ERROR);
  return mimeType;
}

/** The first rejected file's message, or null when every file is accepted. */
export function listingDocumentsError(files: DocumentFileLike[]): string | null {
  try { files.forEach(listingDocumentMimeType); return null; }
  catch (error) { return error instanceof Error ? error.message : DOCUMENT_TYPE_ERROR; }
}

/** Office/shop document slots: the selected files (still to upload). */
export interface OfficeShopFiles { floorPlan: File | null; policy: File | null; documents: File[] }
export type OfficeShopDocumentSlot = keyof OfficeShopFiles;

/** Each document card: input id, R2 document type, default label, multiple. */
export const DOCUMENT_CARDS: Array<{ slot: OfficeShopDocumentSlot; id: string; documentType: string; label: string; aria: string; multiple: boolean }> = [
  { slot: 'floorPlan', id: 'os-floor-plan', documentType: 'floor_plan', label: 'Floor plan (optional)', aria: 'Upload floor plan', multiple: false },
  { slot: 'documents', id: 'os-documents', documentType: 'ownership_management', label: 'Ownership and management (optional)', aria: 'Upload ownership and management documents', multiple: true },
  { slot: 'policy', id: 'os-policy-file', documentType: 'commercial_policy', label: 'Property Policy', aria: 'Upload property policy', multiple: false },
];

/** Labels of the existing-document links in edit mode, by document type. */
export const EXISTING_DOCUMENT_LABELS: Record<string, string> = {
  floor_plan: 'Floor plan', commercial_policy: 'Property Policy', ownership_management: 'Ownership / management document',
};

/**
 * A document card's name line: the chosen files ("N files selected" for
 * several in the multiple input), else the uploaded documents' filenames,
 * else its default label.
 */
export function documentCardLabel(selected: Array<{ name: string }>, uploadedNames: string[], defaultLabel: string, multiple: boolean): string {
  if (selected.length) return multiple && selected.length > 1 ? `${selected.length} files selected` : selected.map((file) => file.name).join(', ');
  return uploadedNames.length ? uploadedNames.join(', ') : defaultLabel;
}
