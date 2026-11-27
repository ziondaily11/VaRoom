import type { Category, HotelMode, PropertyPurpose, SaleMode } from './formState';
import { isOfficeShop, SHORT_STAY } from './formState';

// The listing wizard's wording for each niche (migrated from
// legacy-pages/list.html). list.html rewrote labels in sequence
// (configureCategory → configureHotelLanguage → configurePropertyLanguage →
// applyPropertyPurpose / applyHotelMode → configureListingIntro); this is the
// end result of that sequence as one function, with the same strings.

export const CATEGORY_LABELS: Record<Category, string> = {
  airbnb: 'Airbnb', hotel: 'Hotel', venue: 'Event ground / venue',
  office: 'Office', shop: 'Shop', property: 'Property to let or buy',
};

const PRICING_HEADINGS: Record<Category, string> = {
  airbnb: 'Make every night clear.', hotel: 'Set your room rate and stay rules.', venue: 'Make every booking clear.',
  office: 'Make every month clear.', shop: 'Make every month clear.', property: 'Make every month clear.',
};
const HEADLINES: Record<Category, string> = {
  airbnb: 'Tell guests about your place.',
  hotel: 'Tell guests about your room.',
  venue: 'Tell guests about your venue.',
  office: 'Tell renters about your office.',
  shop: 'Tell renters about your shop.',
  property: 'Tell people about your property.',
};

const INTRO_PLACEHOLDERS: Record<'airbnb' | 'hotel' | 'venue' | 'commercial', { title: string; summary: string; description: string }> = {
  airbnb: {
    title: 'e.g. Modern 2-bedroom apartment in Kilimani',
    summary: 'e.g. A stylish city retreat with everything you need for a comfortable stay.',
    description: 'Describe the accommodation, rooms, amenities, atmosphere, location, and what makes the stay special.',
  },
  hotel: {
    title: 'e.g. Boutique hotel in Westlands, Nairobi',
    summary: 'e.g. Comfortable rooms, thoughtful service, and a welcoming atmosphere.',
    description: 'Describe the rooms, facilities, services, location, dining options, and guest experience.',
  },
  venue: {
    title: 'e.g. Garden wedding venue in Karen',
    summary: 'e.g. An elegant outdoor setting for unforgettable celebrations.',
    description: 'Describe the venue, capacity, layout, facilities, event types, accessibility, and available amenities.',
  },
  commercial: {
    title: 'e.g. Furnished office space in Westlands',
    summary: 'e.g. A professional, accessible space designed for business and growth.',
    description: 'Describe the space, layout, facilities, location, accessibility, and suitability for its intended business use.',
  },
};

const DEFAULT_ABOUT_SUB = 'Give it a clear title, then describe what makes it worth choosing.';
const DEFAULT_LOCATION_SUB = 'Add the neighbourhood and city. You can add the exact location later.';
// At least 5 photos (3 for a restaurant-only hotel), 8 photos and videos in all, videos with a plan that includes them (photoQuality.ts).
const DEFAULT_PHOTO_HINT = 'At least 5 sharp photos, up to 8 photos and videos (2 video tours with a plan that includes video) · JPG, PNG or WEBP photos · MP4, MOV or WEBM videos up to 60 seconds.';
const PHOTOS_ONLY_HINT = 'At least 5 sharp photos, up to 8 · JPG, PNG or WEBP. Silver and Gold listings use photos only.';

/** Every label, heading and placeholder the steps show. */
export interface WizardCopy {
  headline: string;
  aboutSub: string;
  titleLabel: string;
  titlePlaceholder: string;
  captionLabel: string;
  captionPlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  locationTitle: string;
  locationSub: string;
  spaceTitle: string;
  spaceSub: string;
  mediaTitle: string;
  mediaSub: string;
  photoHint: string;
  amenitiesLabel: string;
  amenitiesHint: string;
  sizeLabel: string;
  sizePlaceholder: string;
  pricingHeading: string;
  bookingSub: string;
  maxGuestsLabel: string;
  maxGuestsPlaceholder: string;
  minStayLabel: string;
  minStayPlaceholder: string;
  cleaningFeeLabel: string;
  availabilityHint: string;
  dropzoneText?: string;
}

export function wizardCopy(category: Category, hotelMode: HotelMode | null, purpose: PropertyPurpose, editMode: boolean): WizardCopy {
  const copy: WizardCopy = {
    headline: HEADLINES[category] || "Let's list your first space.",
    aboutSub: DEFAULT_ABOUT_SUB,
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Modern 2-bedroom apartment in Kilimani',
    captionLabel: 'Summary highlight',
    captionPlaceholder: 'e.g. A stylish city retreat with everything you need for a comfortable stay.',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Describe the accommodation, rooms, amenities, atmosphere, location, and what makes the stay special.',
    locationTitle: 'Where is your space?',
    locationSub: DEFAULT_LOCATION_SUB,
    spaceTitle: 'What is it like?',
    spaceSub: 'The details people compare before they choose.',
    mediaTitle: 'Showcase the property.',
    mediaSub: 'Choose a cover, add angles of the interior, exterior and compound, then drag to set the order.',
    photoHint: DEFAULT_PHOTO_HINT,
    amenitiesLabel: 'Amenities',
    amenitiesHint: 'Select everything this space offers. Shown to guests on the booking page.',
    // Hotels only: Airbnbs and venues give numbers instead (bedrooms, beds; seated, standing).
    sizeLabel: 'Room type',
    sizePlaceholder: 'e.g. Deluxe King room',
    pricingHeading: PRICING_HEADINGS[category] || 'Make every booking clear.',
    bookingSub: 'Choose a category on step 1 to continue.',
    maxGuestsLabel: 'Max guests',
    maxGuestsPlaceholder: 'e.g. 4',
    minStayLabel: 'Min. stay (nights)',
    minStayPlaceholder: 'e.g. 2',
    cleaningFeeLabel: 'Cleaning fee (KES, optional)',
    availabilityHint: "Tap dates to open them for booking. Clients will only be able to request dates you've opened here.",
  };

  if (category === 'hotel') copy.bookingSub = 'Choose what this hotel offers to set up the right booking experience.';
  else if (SHORT_STAY.includes(category)) copy.bookingSub = 'Priced per night or hour, with real availability.';
  else copy.bookingSub = 'Priced per month, for longer-term arrangements.';

  if (category === 'hotel') {
    Object.assign(copy, {
      titleLabel: 'Room listing name',
      titlePlaceholder: 'e.g. Deluxe King Room at Westlands',
      captionLabel: 'Guest-facing highlight',
      captionPlaceholder: 'A calm king room with breakfast and skyline views.',
      descriptionLabel: 'Room and hotel details',
      descriptionPlaceholder: 'Describe the room, bed configuration, bathroom, breakfast, hotel facilities, and anything guests should know before check-in.',
      mediaTitle: 'Showcase the stay.',
      mediaSub: 'Lead with the guest room, then include the bathroom, lobby, dining, and standout hotel facilities.',
      photoHint: 'At least 5 sharp room, hotel or facility photos, up to 8 photos and videos (2 video tours with a plan that includes video) · JPG, PNG or WEBP photos · MP4, MOV or WEBM videos up to 60 seconds.',
      amenitiesLabel: 'Room & hotel amenities',
      amenitiesHint: 'Choose the comforts and hotel facilities available to guests booking this room.',
      maxGuestsLabel: 'Guests per room',
      maxGuestsPlaceholder: 'e.g. 2',
      minStayLabel: 'Minimum nights',
      minStayPlaceholder: 'e.g. 1',
      cleaningFeeLabel: 'Service fee (KES, optional)',
      availabilityHint: 'Open the dates this room can be reserved. Guests will only be able to request available stay dates.',
    });
    if (hotelMode === 'table') {
      Object.assign(copy, {
        titleLabel: 'Restaurant / dining name',
        photoHint: 'At least 3 sharp photos of the restaurant, up to 8 photos and videos (2 video tours with a plan that includes video).',
        pricingHeading: 'Set up table reservations.',
        bookingSub: 'Add the hours and table capacity guests need before sending a request.',
      });
    } else if (hotelMode === 'both') {
      copy.bookingSub = 'Keep your hotel stay settings, then add dining hours and table capacity.';
    }
  }

  if (category === 'property') {
    Object.assign(copy, {
      aboutSub: 'Give it a clear name, then describe the property and its units.',
      mediaTitle: 'Showcase the property.',
      titleLabel: 'Property name',
      titlePlaceholder: 'e.g. Karen Villas, Amani Apartments, or Greenview Residences',
      captionLabel: 'Summary highlight',
      captionPlaceholder: 'A calm executive residence with generous natural light and secure compound.',
      descriptionLabel: 'Property & unit details',
      descriptionPlaceholder: 'Tell buyers or tenants what they should know — available units, property/unit sizes, bedrooms and bathrooms, layout, notable compound features, location access, and terms before deciding to rent or buy.',
      locationTitle: 'Where is your property?',
      locationSub: 'Add the neighbourhood and town. You can add the exact location later.',
      mediaSub: 'Choose a cover, add angles of the interior, exterior and compound, then drag to set the order.',
      photoHint: PHOTOS_ONLY_HINT,
      amenitiesLabel: 'Property features & amenities',
      amenitiesHint: 'Select the key features and facilities this property offers to prospective tenants or buyers.',
    });
    if (purpose === 'sale') Object.assign(copy, { pricingHeading: 'Set your sale price.', bookingSub: 'Specify whether this is an exact sale price or a starting price.' });
    else if (purpose === 'rent') Object.assign(copy, { pricingHeading: 'Make every month clear.', bookingSub: 'Priced per month, for longer-term rental arrangements.' });
    else Object.assign(copy, { pricingHeading: 'Set rental & sale pricing.', bookingSub: 'Provide both monthly rental terms and purchase pricing for interested clients.' });
  }

  if (category === 'airbnb') copy.mediaTitle = 'Showcase the space.';

  if (isOfficeShop(category)) {
    Object.assign(copy, {
      aboutSub: DEFAULT_ABOUT_SUB,
      locationTitle: 'Where is your space?',
      locationSub: 'Add the neighbourhood and city, separated by a comma. You can add the exact location later.',
      mediaTitle: 'Show the actual space.',
      mediaSub: 'Add at least 5 photos of the actual unit. The first one is the cover.',
      spaceTitle: 'About the space.',
      spaceSub: 'Size, fit-out, amenities, opening hours and parking.',
      photoHint: PHOTOS_ONLY_HINT,
      pricingHeading: 'Set the commercial terms.',
      bookingSub: 'Choose the pricing basis, then add costs and availability clearly.',
    });
  }

  // configureListingIntro: placeholders for every niche except property.
  const intro = isOfficeShop(category) ? INTRO_PLACEHOLDERS.commercial : category === 'property' ? null : INTRO_PLACEHOLDERS[category];
  if (intro) {
    copy.captionLabel = 'Summary highlight';
    if (category === 'hotel' && hotelMode === 'table') {
      copy.titlePlaceholder = 'e.g. The Garden Restaurant';
      copy.captionPlaceholder = 'e.g. Relaxed garden dining with chef-led Kenyan favourites.';
    } else {
      copy.titlePlaceholder = intro.title;
      copy.captionPlaceholder = intro.summary;
    }
    copy.descriptionPlaceholder = intro.description;
  }

  if (editMode) {
    copy.headline = 'Edit your listing.';
    copy.photoHint = 'Existing listing photos cannot be added, removed, or reordered here.';
    copy.dropzoneText = 'Photos are locked while editing this listing';
  }
  return copy;
}

// ---------- Prices ----------

export interface PriceUnitOption { value: string; label: string }

/** The price-unit choices for a niche (office/shop narrow it to the commercial basis elsewhere). */
export function priceUnitOptions(category: Category): PriceUnitOption[] {
  if (category === 'hotel') return [{ value: 'night', label: 'Per night' }];
  if (SHORT_STAY.includes(category)) return [{ value: 'hour', label: 'Per hour' }, { value: 'night', label: 'Per night' }];
  return [{ value: 'month', label: 'Per month' }];
}

export const defaultPriceUnit = (category: Category) => (category === 'hotel' || SHORT_STAY.includes(category) ? 'night' : 'month');

export function unitLabel(unit: string): string {
  switch (unit) {
    case 'hour': return ' / hour';
    case 'day': return ' / day';
    case 'week': return ' / week';
    case 'year': return ' / year';
    case 'sq_ft': return ' / sq ft';
    case 'm2': return ' / m²';
    case 'desk': return ' / desk';
    case 'turnover': return ' / turnover';
    case 'month': return ' / month';
    default: return ' / night';
  }
}

const kes = (value: string) => Number(value).toLocaleString();

/** The large price line on step 4. */
export function pricePreview(category: Category, purpose: PropertyPurpose, saleMode: SaleMode, amount: string, saleAmount: string, unit: string): { amount: string; unit: string } {
  if (category === 'property') {
    const prefix = saleMode === 'starting' ? 'From KES ' : 'KES ';
    if (purpose === 'sale') return { amount: saleAmount ? prefix + kes(saleAmount) : 'KES 0', unit: ' (for sale)' };
    if (purpose === 'both') {
      return { amount: `Rent: KES ${amount ? kes(amount) : '0'} / mo`, unit: ` · Sale: ${saleAmount ? prefix + kes(saleAmount) : 'Not set'}` };
    }
  }
  return { amount: `KES ${amount ? kes(amount) : '0'}`, unit: unitLabel(unit) };
}

/** The review card's price line. */
export function reviewPrice(category: Category, purpose: PropertyPurpose, saleMode: SaleMode, amount: string, saleAmount: string, unit: string): string {
  const prefix = saleMode === 'starting' ? 'From KES ' : 'KES ';
  if (category === 'property' && purpose === 'sale') return saleAmount ? prefix + kes(saleAmount) : 'Price not set';
  if (category === 'property' && purpose === 'both') {
    const rent = amount ? `Rent: KES ${kes(amount)} / month` : '';
    const sale = saleAmount ? `Sale: ${prefix}${kes(saleAmount)}` : '';
    return [rent, sale].filter(Boolean).join(' · ') || 'Price not set';
  }
  return amount ? `KES ${kes(amount)}${unitLabel(unit)}` : 'Price not set';
}

/** The review hero's price line (slightly different wording, as before). */
export function heroPriceLine(category: Category, purpose: PropertyPurpose, saleMode: SaleMode, amount: string, saleAmount: string, unit: string): string {
  const prefix = saleMode === 'starting' ? 'From KES ' : 'KES ';
  if (category === 'property' && purpose === 'sale') return saleAmount ? prefix + kes(saleAmount) : 'Price not set';
  if (category === 'property' && purpose === 'both') return (amount ? `Rent KES ${kes(amount)}/mo` : '') + (saleAmount ? ` · Sale ${prefix}${kes(saleAmount)}` : '');
  return amount ? `KES ${kes(amount)}${unitLabel(unit)}` : 'Price not set';
}

/** The review card's meta line. */
export function reviewMeta(category: Category, purpose: PropertyPurpose, location: string, units: string, bedroomType: string, bathrooms: string): string {
  if (category === 'property') {
    const purposeLabel = purpose === 'rent' ? 'For rent' : purpose === 'sale' ? 'For sale' : 'For rent & sale';
    const unitsLabel = units ? `${units} unit${units === '1' ? '' : 's'} available` : '';
    const bedBath = [bedroomType, bathrooms ? `${bathrooms} bathroom${bathrooms === '1' ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    return ['Property', purposeLabel, unitsLabel, bedBath, location].filter(Boolean).join(' · ');
  }
  return [CATEGORY_LABELS[category] || 'Listing', location].filter(Boolean).join(' · ');
}
