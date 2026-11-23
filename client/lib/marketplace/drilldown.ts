import { OFFICE_SUBTYPES, SHOP_SUBTYPES, type Option } from '../listWizard/officeShop';

// Marketplace drill-down: the steps a category narrows through (Property:
// Buy/Rent → type → bedrooms; Offices and Shops: their type), the path the
// guest has taken, and the breadcrumb back up it. Every value comes from what
// hosts choose in the listing wizard, so each step filters real data.

export type StepKey = 'purpose' | 'type' | 'beds' | 'subtype';
export type { Option };

export interface Step {
  /** Also the page address's parameter (?purpose=buy&type=apartment&beds=3). */
  key: StepKey;
  /** What the tab row is called for screen readers. */
  label: string;
  options: Option[];
}

export const PURPOSES: Option[] = [['buy', 'Buy'], ['rent', 'Rent']];

/** Property types hosts choose in the wizard (listing_booking_details.property_type). */
export const PROPERTY_TYPES: Option[] = [
  ['apartment', 'Apartment'], ['house', 'House'], ['bungalow', 'Bungalow'],
  ['maisonette', 'Maisonette'], ['townhouse', 'Townhouse'], ['villa', 'Villa'],
];

/**
 * Bedrooms, as the wizard stores them in size_or_type ('Bedsitter', 'Studio',
 * '1 bedroom', '2 bedrooms' … '5 bedrooms'). The label is the stored text.
 */
export const BEDROOMS: Option[] = [
  ['bedsitter', 'Bedsitter'], ['studio', 'Studio'], ['1', '1 bedroom'],
  ['2', '2 bedrooms'], ['3', '3 bedrooms'], ['4', '4 bedrooms'], ['5', '5 bedrooms'],
];

const STEPS: Record<string, Step[]> = {
  property: [
    { key: 'purpose', label: 'Buy or rent', options: PURPOSES },
    { key: 'type', label: 'Property type', options: PROPERTY_TYPES },
    { key: 'beds', label: 'Bedrooms', options: BEDROOMS },
  ],
  office: [{ key: 'subtype', label: 'Office type', options: OFFICE_SUBTYPES }],
  shop: [{ key: 'subtype', label: 'Shop type', options: SHOP_SUBTYPES }],
};

/** The steps a category narrows through (none for the others). */
export function categorySteps(category: string): Step[] {
  return STEPS[category] || [];
}

const optionLabel = (step: Step, value: string) => (step.options.find(([key]) => key === value) || [value, value])[1];

/**
 * The path from the page address: each step's value in order, stopping at the
 * first missing or unknown one (a step is only reached through the one before).
 */
export function pathFromQuery(category: string, read: (key: StepKey) => string): string[] {
  const path: string[] = [];
  for (const step of categorySteps(category)) {
    const value = read(step.key).trim().toLowerCase();
    if (!step.options.some(([key]) => key === value)) break;
    path.push(value);
  }
  return path;
}

/** The path as page-address parameters ({ purpose: 'buy', type: 'apartment' }). */
export function pathQuery(category: string, path: readonly string[]): Partial<Record<StepKey, string>> {
  const query: Partial<Record<StepKey, string>> = {};
  categorySteps(category).forEach((step, index) => { if (path[index]) query[step.key] = path[index]; });
  return query;
}

/**
 * The tab row to show: the next step to choose, or — once every step is
 * chosen — the last one, so its siblings stay one tap away. Null when the
 * category has no steps (the category tabs stay).
 */
export function currentStep(category: string, path: readonly string[]): { step: Step; index: number } | null {
  const steps = categorySteps(category);
  if (!steps.length) return null;
  const index = Math.min(path.length, steps.length - 1);
  return { step: steps[index], index };
}

/** Choosing a value on a step keeps the steps before it and drops the ones after. */
export function choose(path: readonly string[], index: number, value: string): string[] {
  return [...path.slice(0, index), value];
}

/**
 * How the path filters listings. Buy is a property for sale or for both; Rent
 * is for rent, for both, or an older listing with no purpose (the wizard's
 * default). The other steps match what the wizard stores in the details row.
 */
export interface PathFilter {
  purposes: string[] | null;
  includeNoPurpose: boolean;
  propertyType: string | null;
  /** Matched case-insensitively against size_or_type. */
  sizeOrType: string | null;
}

export function pathFilter(category: string, path: readonly string[]): PathFilter {
  const filter: PathFilter = { purposes: null, includeNoPurpose: false, propertyType: null, sizeOrType: null };
  categorySteps(category).forEach((step, index) => {
    const value = path[index];
    if (!value) return;
    if (step.key === 'purpose') {
      filter.purposes = value === 'buy' ? ['sale', 'both'] : ['rent', 'both'];
      filter.includeNoPurpose = value === 'rent';
    } else if (step.key === 'type') filter.propertyType = value;
    else if (step.key === 'beds') filter.sizeOrType = optionLabel(step, value);
    else filter.sizeOrType = value;
  });
  return filter;
}

export interface Crumb {
  label: string;
  /** The Marketplace address this part leads back to. */
  href: string;
}

/** The Marketplace address for a category and path (other search words kept by the caller). */
export function marketplaceHref(category: string, path: readonly string[], extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  Object.entries(extra).forEach(([key, value]) => { if (value) params.set(key, value); });
  if (category && category !== 'all') params.set('category', category);
  Object.entries(pathQuery(category, path)).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
}

/**
 * The breadcrumb: Marketplace › category › each chosen step. Every part leads
 * back to that point; `extra` (the search words) is kept on each link.
 */
export function crumbs(category: string, categoryLabel: string, path: readonly string[], extra: Record<string, string> = {}): Crumb[] {
  if (!category || category === 'all') return [];
  const steps = categorySteps(category);
  const list: Crumb[] = [
    { label: 'Marketplace', href: marketplaceHref('all', [], extra) },
    { label: categoryLabel, href: marketplaceHref(category, [], extra) },
  ];
  path.forEach((value, index) => {
    if (steps[index]) list.push({ label: optionLabel(steps[index], value), href: marketplaceHref(category, path.slice(0, index + 1), extra) });
  });
  return list;
}

// ---------- The trail carried to a listing's page ----------

/**
 * A listing opened from the Marketplace carries where the guest was
 * (?trail=property.buy.apartment.3), so its page can show the breadcrumb back.
 * Only known values survive parsing.
 */
export function encodeTrail(category: string, path: readonly string[]): string {
  return category && category !== 'all' ? [category, ...path].join('.') : '';
}

export function decodeTrail(value: unknown, isCategory: (key: string) => boolean): { category: string; path: string[] } | null {
  if (typeof value !== 'string' || !value) return null;
  const [category, ...rest] = value.split('.').map((part) => part.trim().toLowerCase());
  if (!category || !isCategory(category)) return null;
  const steps = categorySteps(category);
  return { category, path: pathFromQuery(category, (key) => rest[steps.findIndex((step) => step.key === key)] || '') };
}
