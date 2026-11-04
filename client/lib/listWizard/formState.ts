// The listing wizard's form state (migrated from legacy-pages/list.html).
//
// Saved drafts (IndexedDB on the host's device and /api/listing-drafts on the
// server) store the form the way the legacy page captured it from the DOM:
// `fields` keyed by each control's element id, plus separate lists for the
// controls that had no id. The React wizard keeps exactly that shape, so a
// draft saved by either page restores in the other, and Pricing keeps reading
// the same draft pointer.

/** A text/number/date/select value, or a checkbox's checked state. */
export type FieldValue = string | boolean;

/** Every control with an element id, keyed by that id (as list.html captured them). */
export type Fields = Record<string, FieldValue>;

/** A control without an id (office/shop layout checkboxes and the like), as captured. */
export interface CapturedControl {
  formIndex: number;
  id: string;
  name: string;
  nameIndex: number;
  osKey: string;
  osUse: string;
  type: string;
  value: string;
  checked?: boolean;
}

export interface OfficeShopCharge { type: string; amount: string; frequency: string }

export type Category = 'airbnb' | 'hotel' | 'venue' | 'office' | 'shop' | 'property';
export type HotelMode = 'stay' | 'table' | 'both';
export type PropertyPurpose = 'rent' | 'sale' | 'both';
export type SaleMode = 'exact' | 'starting';

export const SHORT_STAY: Category[] = ['airbnb', 'hotel', 'venue'];
export const LONG_TERM: Category[] = ['office', 'shop', 'property'];
export const isOfficeShop = (category: string | null | undefined) => category === 'office' || category === 'shop';

/** The wizard's whole form: what a draft snapshot holds (besides identity and media). */
export interface WizardForm {
  fields: Fields;
  /** Captured id-less controls; office/shop layout checkboxes are restored from these. */
  controls: CapturedControl[];
  propertyPurpose: PropertyPurpose;
  propertySalePriceMode: SaleMode;
  hotelListingMode: HotelMode | null;
  availableDates: string[];
  currentStep: number;
  furthestStep: number;
  /** Amenity checkboxes in the Amenities Library (airbnb, hotel, venue, property). */
  amenities: Array<{ key: string; checked: boolean }>;
  /** Office/shop amenity checkboxes (`data-os-key` in list.html). */
  officeShopAmenitySelections: Record<string, boolean>;
  /** Office/shop permitted uses (`data-os-use` in list.html). */
  officeShopPermittedUses: string[];
  officeShopCharges: OfficeShopCharge[];
}

export const emptyForm = (): WizardForm => ({
  fields: {},
  controls: [],
  propertyPurpose: 'rent',
  propertySalePriceMode: 'exact',
  hotelListingMode: null,
  availableDates: [],
  currentStep: 1,
  furthestStep: 1,
  amenities: [],
  officeShopAmenitySelections: {},
  officeShopPermittedUses: [],
  officeShopCharges: [],
});

/** A field as text ('' when unset or a checkbox). */
export const text = (fields: Fields, id: string): string => {
  const value = fields[id];
  return typeof value === 'string' ? value : '';
};

/** A checkbox field ('false' when unset). */
export const checked = (fields: Fields, id: string): boolean => fields[id] === true;

/** "Westlands, Nairobi" → neighbourhood "Westlands", city "Nairobi" (unchanged from list.html). */
export function splitListingArea(value: string): { neighborhood: string; city: string } {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  return { neighborhood: parts[0] || '', city: parts.length > 1 ? parts.slice(1).join(', ') : '' };
}

/**
 * The props every wizard section takes: read a field, write a field. Sections
 * render controls with the same ids, names and data attributes as list.html.
 */
export interface FieldBinding {
  fields: Fields;
  setField: (id: string, value: FieldValue) => void;
}
