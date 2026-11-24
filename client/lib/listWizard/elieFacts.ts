import { text, type Category, type WizardForm } from './formState';
import { selectedLibraryOptions } from './amenities';

// What "Write with Elie" writes a summary highlight or description from: the
// details the host has filled in so far, labelled (server/routes/elieHostRoutes.js).

const FIELD_LABELS: Array<[id: string, label: string]> = [
  ['title', 'Title'],
  ['location-neighbourhood', 'Neighbourhood'],
  ['location-city', 'City'],
  ['property-type', 'Property type'],
  ['property-bedroom-type', 'Bedroom type'],
  ['property-units-available', 'Units available'],
  ['stay-bedrooms', 'Bedrooms'],
  ['stay-beds', 'Beds'],
  ['stay-bathrooms', 'Bathrooms'],
  ['property-bathrooms', 'Bathrooms'],
  ['max-guests', 'Maximum guests'],
  ['size-or-type', 'Size or type'],
  ['hotel-rooms-available', 'Rooms available'],
  ['venue-seated', 'Seated capacity'],
  ['venue-standing', 'Standing capacity'],
  ['price-amount', 'Price (KES)'],
  ['price-unit', 'Price per'],
];

export function elieListingFacts(form: WizardForm, category: Category): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const [id, label] of FIELD_LABELS) {
    const value = text(form.fields, id).trim();
    if (value) facts[label] = value.slice(0, 600);
  }
  const amenities = selectedLibraryOptions(category, form.amenities, form.officeShopAmenitySelections).map((option) => option.label);
  if (amenities.length) facts.Amenities = amenities.join(', ').slice(0, 600);
  if (form.officeShopPermittedUses.length) facts['Permitted uses'] = form.officeShopPermittedUses.join(', ').slice(0, 600);
  return facts;
}
