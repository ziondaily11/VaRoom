// The office and shop sections of the booking page (location, space,
// amenities, pricing and costs, lease, documents), from the listing's
// office_shop_details. Labels and rules unchanged from legacy-pages/booking.html.

type Labels = Record<string, string>;
type Bag = Record<string, unknown>;

export interface GridItem { label: string; value: string }

const bag = (value: unknown): Bag => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : {});

export const SUBTYPE_LABELS: Labels = {
  private_office: 'Private office', shared_office: 'Shared office', serviced_office: 'Serviced office', coworking_desk: 'Coworking desk', meeting_room: 'Meeting room',
  street_front_shop: 'Street-front shop', mall_unit: 'Mall unit', showroom: 'Showroom', studio: 'Studio',
};

const LABELS = {
  role: { owner: 'Owner', authorized_manager: 'Authorised property manager', agent: 'Agent' },
  fitout: { shell_core: 'Shell-and-core', partly_fitted: 'Partly fitted', fitted: 'Fitted', furnished: 'Furnished' },
  measure: { usable: 'Usable area', rentable: 'Rentable area', estimate: 'Estimated area' },
  pricing: { whole_month: 'Whole unit, per month', whole_year: 'Whole unit, per year', per_area: 'Per area', per_desk: 'Per desk or person', daily_weekly_hourly: 'Daily, weekly or hourly', turnover: 'Turnover rent' },
  yesNo: { yes: 'Yes', no: 'No', allowed: 'Allowed', not_allowed: 'Not allowed', landlord_consent: 'Allowed with landlord consent', landlord_approval: 'Subject to landlord approval', to_confirm: 'To confirm', not_confirmed: 'Not confirmed', tenant_must_restore: 'Tenant must restore', not_required: 'Not required' },
  service: { included: 'Included', not_included: 'Not included', not_confirmed: 'Not confirmed' },
  utilities: { included: 'Included', metered: 'Metered separately', fixed_fee: 'Fixed monthly fee', tenant_arranges: 'Tenant arranges', not_confirmed: 'Not confirmed' },
  tax: { included: 'Included', added: 'Added on top', not_applicable: 'Not applicable', needs_confirmation: 'Needs confirmation' },
  afterHours: { '24_7': '24/7', business_hours: 'Business hours only', not_confirmed: 'Not confirmed' },
  frequency: { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', annually: 'Annually', one_off: 'One-off', custom: 'Custom' },
  increases: { none: 'None', annual: 'Annual escalation', stepped: 'Stepped', index_linked: 'Index-linked', not_confirmed: 'Not confirmed' },
} satisfies Record<string, Labels>;

const TRUE_AMENITIES: Labels = {
  mains_supply: 'Mains supply', backup_generator: 'Backup generator', ups: 'UPS', fibre: 'Fibre available', wifi_included: 'Wi-Fi included in rent', tenant_internet: 'Tenant arranges internet',
  reliable_water: 'Reliable water supply', borehole: 'Borehole', private_washroom: 'Private washroom', shared_washroom: 'Shared washroom', drainage: 'Drainage connection',
  guards: 'Guards', cctv: 'CCTV', controlled_entry: 'Controlled entry', alarm: 'Alarm', lighting: 'Lighting', lift: 'Lift', accessibility: 'Accessibility features',
  ac_ventilation: 'AC or ventilation', natural_light: 'Natural light', cleaning: 'Cleaning', maintenance: 'Maintenance', waste_collection: 'Waste collection', reception: 'Reception', shared_kitchen: 'Shared kitchen', meeting_rooms: 'Meeting rooms',
};

const CHARGE_LABELS: Labels = { parking: 'Parking', access_cards: 'Access cards', cleaning: 'Cleaning', internet: 'Internet', agent_fee: 'Agent fee', legal_registration: 'Legal or registration', signage: 'Signage', building_fee: 'Building fee' };

export function commercialLabel(value: unknown, labels: Labels): string | null {
  const key = value as string;
  return labels[key] || (value ? String(value).replace(/_/g, ' ') : null);
}

export function commercialNumber(value: unknown): string | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString() : null;
}

export function commercialKes(value: unknown): string | null {
  const numberValue = commercialNumber(value);
  return numberValue == null ? null : `KSh ${numberValue}`;
}

export function commercialDate(value: unknown): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Only the items that have a value. */
export function gridItems(items: Array<{ label: string; value: unknown }>): GridItem[] {
  return items.filter((item) => item && item.value !== null && item.value !== undefined && item.value !== '')
    .map((item) => ({ label: item.label, value: String(item.value) }));
}

const text = (value: unknown) => (value === undefined ? undefined : value);
const withExtra = (label: string | null, extra: string) => (label ? `${label}${extra}` : null);

export interface CommercialDetails {
  location: GridItem[];
  addressAfterInquiry: boolean;
  space: GridItem[];
  layout: string[];
  amenities: string[];
  amenityNotes: GridItem[];
  parking: GridItem[];
  pricing: GridItem[];
  costs: GridItem[];
  charges: string[];
  lease: GridItem[];
  documentsOnRequest: boolean;
}

export function commercialDetails(
  listing: { category: string | null; city: string | null; neighborhood: string | null; address_visibility: string | null },
  officeShopValue: Bag,
): CommercialDetails {
  const officeShop = officeShopValue;
  const space = bag(officeShop.space);
  const amenities = bag(officeShop.amenities);
  const parking = bag(officeShop.parking);
  const pricing = bag(officeShop.pricing);
  const costs = bag(officeShop.costs);
  const lease = bag(officeShop.lease);
  const documents = bag(officeShop.documents);
  const isOffice = listing.category === 'office';
  const areaValue = commercialNumber(space.area);
  const areaText = areaValue == null ? null : `${areaValue} ${space.area_unit === 'm2' ? 'm²' : 'sq ft'}`;
  const layout = isOffice ? space.office_layout : space.shop_layout;
  const parkingText = parking.cost === 'paid' && commercialKes(parking.paid_amount)
    ? `Paid · ${commercialKes(parking.paid_amount)}`
    : commercialLabel(parking.cost, { free: 'Free', paid: 'Paid', not_confirmed: 'Not confirmed' });
  const charges = Array.isArray(costs.compulsory_charges) ? (costs.compulsory_charges as Bag[]) : [];
  const serviceExtra = costs.service_charge === 'not_included' && commercialKes(costs.service_amount)
    ? ` · ${commercialKes(costs.service_amount)}${costs.service_frequency ? ` / ${String(commercialLabel(costs.service_frequency, LABELS.frequency)).toLowerCase()}` : ''}`
    : '';
  const utilitiesExtra = costs.utilities === 'fixed_fee' && commercialKes(costs.utilities_amount) ? ` · ${commercialKes(costs.utilities_amount)} / month` : '';
  const months = (value: unknown) => (commercialNumber(value) ? `${commercialNumber(value)} month(s)` : null);

  return {
    location: gridItems([
      { label: 'City / county', value: listing.city },
      { label: 'Neighbourhood', value: listing.neighborhood },
      { label: 'Building / complex', value: bag(officeShop.location).building_name },
      { label: 'Listed by', value: commercialLabel(officeShop.role, LABELS.role) },
    ]),
    addressAfterInquiry: listing.address_visibility === 'after_inquiry',
    space: gridItems([
      { label: 'Area', value: areaText },
      { label: 'Area type', value: commercialLabel(space.area_measure, LABELS.measure) },
      { label: 'Fit-out', value: commercialLabel(space.fitout_status, LABELS.fitout) },
      { label: 'Floor / level', value: text(space.floor_level) },
      { label: 'Rooms', value: commercialNumber(space.room_count) },
      { label: 'Ceiling height', value: text(space.ceiling_height) },
      { label: 'Capacity', value: isOffice ? commercialNumber(space.capacity) : null },
      { label: 'Desks', value: isOffice ? commercialNumber(space.desks) : null },
      { label: 'Private offices / meeting rooms', value: isOffice ? commercialNumber(space.private_rooms) : null },
      { label: 'Furniture / partitions', value: isOffice && space.furniture_included ? 'Included' : null },
      { label: 'Customer-facing area', value: !isOffice ? commercialNumber(space.customer_area) : null },
      { label: 'Storage / mezzanine area', value: !isOffice ? commercialNumber(space.storage_area) : null },
      { label: 'Street frontage', value: !isOffice ? commercialLabel(space.street_frontage, LABELS.yesNo) : null },
      { label: 'Frontage width', value: !isOffice ? text(space.frontage_width) : null },
      { label: 'Display windows', value: !isOffice ? commercialLabel(space.display_windows, LABELS.yesNo) : null },
      { label: 'Delivery / loading access', value: !isOffice ? commercialLabel(space.loading_access, LABELS.yesNo) : null },
      { label: 'Foot traffic', value: !isOffice ? text(space.foot_traffic) : null },
      { label: 'Nearby anchors', value: !isOffice ? text(space.nearby_anchors) : null },
    ]),
    layout: Array.isArray(layout) ? (layout as unknown[]).map(String) : [],
    amenities: Object.keys(TRUE_AMENITIES).filter((key) => amenities[key] === true).map((key) => TRUE_AMENITIES[key]),
    amenityNotes: gridItems([
      { label: 'After-hours access', value: commercialLabel(amenities.after_hours, LABELS.afterHours) },
      { label: 'Power note', value: text(amenities.power_note) },
      { label: 'Internet note', value: text(amenities.internet_note) },
      { label: 'Accessibility note', value: text(amenities.accessibility_note) },
    ]),
    parking: gridItems([
      { label: 'Parking spaces', value: commercialNumber(parking.spaces) },
      { label: 'Parking cost', value: parkingText },
      { label: 'Allocated to this unit', value: parking.allocated ? 'Yes' : null },
      { label: 'Visitor parking', value: parking.visitor ? 'Available' : null },
      { label: 'Customer parking', value: parking.customer ? 'Available' : null },
    ]),
    pricing: gridItems([
      { label: 'Pricing basis', value: commercialLabel(pricing.basis, LABELS.pricing) },
      { label: 'Price', value: commercialKes(pricing.amount) },
      { label: 'Per-area period', value: pricing.basis === 'per_area' ? commercialLabel(pricing.area_period, { month: 'Per month', year: 'Per year' }) : null },
      { label: 'Monthly payment for annual rent', value: pricing.basis === 'whole_year' ? commercialLabel(pricing.monthly_payment, LABELS.yesNo) : null },
      { label: 'Desk fee includes', value: pricing.basis === 'per_desk' ? text(pricing.desk_included) : null },
      { label: 'Short-term terms', value: pricing.basis === 'daily_weekly_hourly' ? text(pricing.short_pricing_note) : null },
      { label: 'Turnover terms', value: pricing.basis === 'turnover' ? text(pricing.turnover_threshold) : null },
    ]),
    costs: gridItems([
      // Left out when not set (before, these rows read "null").
      { label: 'Service charge', value: withExtra(commercialLabel(costs.service_charge, LABELS.service), serviceExtra) },
      { label: 'Utilities', value: withExtra(commercialLabel(costs.utilities, LABELS.utilities), utilitiesExtra) },
      { label: 'VAT / tax', value: commercialLabel(costs.tax, LABELS.tax) },
      { label: 'Security deposit', value: text(costs.security_deposit) },
      { label: 'Advance rent', value: text(costs.advance_rent) },
      { label: 'Rent increases', value: commercialLabel(costs.rent_increases, LABELS.increases) },
    ]),
    charges: charges.map((charge) => `${commercialLabel(charge.type, CHARGE_LABELS)}: ${commercialKes(charge.amount) || 'Not provided'} · ${commercialLabel(charge.frequency, LABELS.frequency)}`),
    lease: gridItems([
      { label: 'Available from', value: commercialDate(lease.available_from) },
      { label: 'Minimum lease term', value: months(lease.minimum_term) },
      { label: 'Payment frequency', value: commercialLabel(lease.payment_frequency, LABELS.frequency) },
      { label: 'Viewing before renting', value: commercialLabel(lease.viewing_required, LABELS.yesNo) },
      { label: 'Preferred lease term', value: months(lease.preferred_term) },
      { label: 'Renewal options', value: commercialLabel(lease.renewal, LABELS.yesNo) },
      { label: 'Notice period', value: text(lease.notice_period) },
      { label: 'Lock-in / early-exit rules', value: text(lease.lock_in) },
      { label: 'Viewing availability', value: text(lease.viewing_availability) },
      { label: 'Accepted payment methods', value: text(lease.payment_methods) },
    ]),
    documentsOnRequest: Boolean(documents.documents_on_request),
  };
}
