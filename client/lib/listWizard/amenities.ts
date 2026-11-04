// The listing wizard's amenities (migrated from legacy-pages/list.html): the
// option lists per category, the Amenities Library's categories, search and
// summary, and getSelectedAmenities(). Keys, labels and SVG strings are
// unchanged from list.html, and the home-stay keys/icons match the booking
// page's amenity grid (lib/booking/bookingIcons.ts AMENITY_ICON).
//
// Selection lives in the wizard form (formState.ts): `form.amenities` for
// airbnb/hotel/venue/property and `form.officeShopAmenitySelections` for
// office/shop. Everything here is a pure function of that state.

import { isOfficeShop, type WizardForm } from './formState';
import { OFFICE_SHOP_AMENITY_GROUPS as OFFICE_SHOP_GROUPS } from './officeShop';

/** [key, label, icon SVG markup], as list.html declared them. */
export type AmenityOption = readonly [key: string, label: string, icon: string];
export type AmenitySelections = WizardForm['amenities'];
export type OfficeShopAmenitySelections = WizardForm['officeShopAmenitySelections'];

// ---------- Home-stay (airbnb, venue; also office/shop's hidden grid) ----------
export const AMENITY_OPTIONS: AmenityOption[] = [
  ['wifi', 'Free Wi-Fi', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>'],
  ['mountain', 'Mountain View', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>'],
  ['parking', 'Free Parking', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>'],
  ['kitchen', 'Kitchen', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>'],
  ['heating', 'Heating', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>'],
  ['tv', 'TV', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>'],
  ['workspace', 'Workspace', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>'],
  ['balcony', 'Balcony', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l8-6 8 6v12"/><path d="M4 21h16"/><path d="M9 21v-6h6v6"/></svg>'],
  ['breakfast', 'Breakfast', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>'],
  ['bonfire', 'Bonfire Area', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 9 9l-4 2 3 2-2 4 6-2 6 2-2-4 3-2-4-2-3-7Z"/></svg>'],
  ['pet', 'Pet Friendly', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.04Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/></svg>'],
  ['power', '24/7 Power Backup', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1"/><path d="M6 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1"/><polyline points="11 7 7 12 13 12 9 17"/><line x1="22" y1="11" x2="22" y2="13"/></svg>'],
  ['air_conditioning', 'Air conditioning', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M7 5v6m10-6v6M6 16c2-2 4-2 6 0s4 2 6 0"/></svg>'],
  ['refrigerator', 'Refrigerator', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="1"/><path d="M6 11h12M9 7h.01M9 15h.01"/></svg>'],
  ['washing_machine', 'Washing machine', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6h.01M16 6h.01"/></svg>'],
  ['pool', 'Swimming pool', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M7 13V5h4"/></svg>'],
  ['gym', 'Gym', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9v6M9 7v10M15 7v10M18 9v6M9 12h6"/></svg>'],
  ['garden', 'Garden', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V11M12 15c-4 0-6-2-6-6 4 0 6 2 6 6Zm0 0c4 0 6-2 6-6-4 0-6 2-6 6Z"/></svg>'],
  ['bbq_grill', 'BBQ grill', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="6"/><path d="m8 16-2 5m10-5 2 5M6 11h12"/></svg>'],
  ['hot_tub', 'Hot tub', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5Z"/><path d="M8 8V5m4 3V4m4 4V5"/></svg>'],
  ['elevator', 'Elevator', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="m9 10 3-3 3 3m0 4-3 3-3-3"/></svg>'],
  ['security_cameras', 'Security cameras', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 10 12-4 3 5-12 4-3-5Z"/><path d="m16 14 2 5M7 15l-2 4"/></svg>'],
  ['smoke_alarm', 'Smoke alarm', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="8" width="14" height="8" rx="3"/><path d="M8 5c0-1 1-2 1-3m3 3c0-1 1-2 1-3m3 3c0-1 1-2 1-3"/></svg>'],
  ['towels_linens', 'Towels & linens', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14v14H5zM5 10h14M10 5v5"/></svg>'],
  ['hair_dryer', 'Hair dryer', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10h8a4 4 0 1 0 0-8H8v5M8 10v9m0 0H5m3 0h3"/></svg>']
];

const iconOf = (key: string): string => { const option = AMENITY_OPTIONS.find((item) => item[0] === key); return option ? option[2] : ''; };

// Hotel amenities deliberately use their own keys and labels. They are not a
// filtered version of the home-stay checklist, so hotel selections remain
// meaningful on the guest-facing room page.
export const HOTEL_GENERIC_AMENITY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M9 21v-5h6v5"/></svg>';
const HOTEL_ICON = HOTEL_GENERIC_AMENITY_ICON;
export const HOTEL_AMENITY_OPTIONS: AmenityOption[] = [
  ['hotel_high_speed_wifi', 'Free High-Speed Wi-Fi', iconOf('wifi')],
  ['hotel_quality_bedding', 'Quality Bedding & Pillows', HOTEL_ICON],
  ['hotel_climate_control', 'Air Conditioning / Climate Control', iconOf('air_conditioning')],
  ['hotel_bedside_outlets', 'Bedside Outlets & USB/USB-C Ports', HOTEL_ICON],
  ['hotel_smart_tv', 'Smart TV / Streaming', iconOf('tv')],
  ['hotel_coffee_maker', 'Coffee Maker / Nespresso', iconOf('breakfast')],
  ['hotel_mini_fridge', 'Mini-Fridge', iconOf('refrigerator')],
  ['hotel_blackout_curtains', 'Blackout Curtains', HOTEL_ICON],
  ['hotel_hot_water', 'Hot Water & Strong Water Pressure', HOTEL_ICON],
  ['hotel_in_room_safe', 'In-Room Safe', HOTEL_ICON],
  ['hotel_complimentary_breakfast', 'Complimentary Breakfast', iconOf('breakfast')],
  ['hotel_onsite_parking', 'Free / On-Site Parking', iconOf('parking')],
  ['hotel_swimming_pool', 'Swimming Pool', iconOf('pool')],
  ['hotel_fitness_center', 'Fitness Center / Gym', iconOf('gym')],
  ['hotel_front_desk', '24-Hour Front Desk', HOTEL_ICON],
  ['hotel_restaurant_bar', 'On-Site Restaurant & Bar', HOTEL_ICON],
  ['hotel_luggage_storage', 'Luggage Storage', HOTEL_ICON],
  ['hotel_airport_shuttle', 'Airport Shuttle / Transport', HOTEL_ICON],
  ['hotel_pet_friendly', 'Pet-Friendly', iconOf('pet')],
  ['hotel_room_service', 'Room Service', HOTEL_ICON]
];

// PROPERTY-ONLY amenities tailored specifically for residential rental and sale.
// Replaces short-stay/hospitality items with real property features.
export const PROPERTY_AMENITY_OPTIONS: AmenityOption[] = [
  ['security', '24/7 Security & Guard', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'],
  ['security_cameras', 'Security cameras', iconOf('security_cameras')],
  ['power', '24/7 Power Backup', iconOf('power')],
  ['parking', 'Dedicated Parking', iconOf('parking')],
  ['proximity_main_road', 'Proximity to main roads', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19L8 5m8 14l4-14M12 7v2m0 4v2m0 4v2"/></svg>'],
  ['proximity_schools', 'Proximity to schools', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'],
  ['furnished', 'Furnished', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="6" y1="18" x2="6" y2="21"/><line x1="18" y1="18" x2="18" y2="21"/></svg>'],
  ['unfurnished', 'Unfurnished', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m3 9 18 0M9 21V9"/></svg>'],
  ['gym', 'Gym', iconOf('gym')],
  ['pool', 'Swimming pool', iconOf('pool')],
  ['balcony', 'Balcony', iconOf('balcony')],
  ['in_unit_laundry', 'In-unit laundry', iconOf('washing_machine')],
  ['onsite_laundry', 'On-site laundry', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M12 10a3 3 0 0 1 3 3"/></svg>'],
  ['elevator', 'Elevator', iconOf('elevator')],
  ['garden', 'Garden / compound', iconOf('garden')],
  ['kitchen', 'Fitted kitchen', iconOf('kitchen')],
  ['refrigerator', 'Refrigerator', iconOf('refrigerator')],
  ['pet', 'Pet friendly', iconOf('pet')],
  ['borehole_water', 'Borehole / Water backup', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'],
  ['wifi', 'High-Speed Internet / Fiber', iconOf('wifi')]
];

// ---------- Office / shop ----------
// The office/shop amenity checkboxes (`data-os-group="os-amenities"`,
// `data-os-key`, `data-os-category`) that renderOfficeShopFields() renders in
// this order. The library lists them as its options for office/shop.
export interface OfficeShopAmenityGroup { title: string; category: string; choices: Array<readonly [key: string, label: string]> }
// The groups are defined once in officeShop.ts; each title is also the checkbox's data-os-category.
export const OFFICE_SHOP_AMENITY_GROUPS: OfficeShopAmenityGroup[] = OFFICE_SHOP_GROUPS.map((group) => ({ title: group.title, category: group.title, choices: group.choices }));

const osIcon = (paths: string): string => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
export const OFFICE_SHOP_AMENITY_ICONS: Record<string, string> = {
  mains_supply: osIcon('<path d="M12 2v10M6.4 5.5a8 8 0 1 0 11.2 0"/>'),
  backup_generator: osIcon('<path d="M12 2 5 13h6l-1 9 9-12h-6l1-8Z"/>'),
  ups: osIcon('<rect x="3" y="7" width="17" height="10" rx="2"/><path d="M23 10v4M11 9l-2 3h3l-1 3 4-5h-3l1-1"/>'),
  fibre: osIcon('<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/>'),
  wifi_included: osIcon('<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/>'),
  tenant_internet: osIcon('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-5-9a7 7 0 0 1 10 0m-7.5 2.5a3.5 3.5 0 0 1 5 0"/>'),
  reliable_water: osIcon('<path d="M12 3c-2.7 3.5-6 7-6 11a6 6 0 0 0 12 0c0-4-3.3-7.5-6-11Z"/><path d="M9 15a3 3 0 0 0 3 3"/>'),
  borehole: osIcon('<path d="M4 21h16M7 21V8h10v13M9 8V4h6v4m-3 0v5m-2 0h4"/><path d="M12 15c-1.3 1.5-2 2.3-2 3a2 2 0 0 0 4 0c0-.7-.7-1.5-2-3Z"/>'),
  private_washroom: osIcon('<path d="M5 12h14l-1 5a4 4 0 0 1-4 3h-4a4 4 0 0 1-4-3l-1-5Zm3 0V5a2 2 0 0 1 2-2h4"/><path d="M8 20v2m8-2v2"/>'),
  shared_washroom: osIcon('<path d="M4 12h16l-1 5a4 4 0 0 1-4 3h-6a4 4 0 0 1-4-3l-1-5Zm4 0V5a2 2 0 0 1 2-2h4"/><path d="M8 20v2m8-2v2"/>'),
  drainage: osIcon('<path d="M4 4v6a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v2M2 4h4m12 16h4"/>'),
  guards: osIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
  cctv: osIcon('<path d="m4 10 12-4 4 6-12 4-4-6Z"/><path d="m16 14 2 5m-11-4-2 4"/><circle cx="17" cy="9" r=".7"/>'),
  controlled_entry: osIcon('<path d="M4 21V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17M2 21h20"/><path d="M8 21v-5h6v5m-3-10h.01"/><path d="m18 7 2 2 3-4"/>'),
  alarm: osIcon('<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4"/><path d="M3 4 1 2m20 2 2-2"/>'),
  lighting: osIcon('<path d="M9 18h6m-5 4h4m-6-7a7 7 0 1 1 8 0c-.8.6-1 1.3-1 3h-6c0-1.7-.2-2.4-1-3Z"/>'),
  lift: osIcon('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 8 3-3 3 3m0 8-3 3-3-3"/>'),
  accessibility: osIcon('<circle cx="12" cy="4" r="2"/><path d="M5 8h8l2 4h4M10 8l-2 6h5l2 5m-7-5-3 5m3-5a5 5 0 1 0 9 2"/>'),
  ac_ventilation: osIcon('<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h8a3 3 0 1 1-3 3"/>'),
  natural_light: osIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
  cleaning: osIcon('<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/>'),
  maintenance: osIcon('<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L15 12l-3-3 2.7-2.7Z"/>'),
  waste_collection: osIcon('<path d="M3 6h18m-2 0-1 14H6L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>'),
  reception: osIcon('<path d="M3 20h18M5 17h14c0-5-3-9-7-9s-7 4-7 9Z"/><path d="M12 8V5m-2 0h4"/>'),
  shared_kitchen: osIcon('<path d="M4 12h16l-1 7H5l-1-7Zm2 0V8a6 6 0 0 1 12 0v4M12 2v3"/><path d="M8 22v-3m8 3v-3"/>'),
  meeting_rooms: osIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m2-13a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm10 3a3 3 0 1 0 0-6m4 16v-2a4 4 0 0 0-3-3.87"/>')
};

// Fallback icons for an office/shop key without its own icon (unchanged from
// list.html's amenityCheckboxIcon; every key above has one today).
const OFFICE_SHOP_ICON_ALIASES: Record<string, string> = { mains_supply: 'power', backup_generator: 'power', ups: 'power', fibre: 'wifi', wifi_included: 'wifi', tenant_internet: 'wifi', lift: 'workspace', accessibility: 'workspace', ac_ventilation: 'air_conditioning', reliable_water: 'pool', borehole: 'pool', private_washroom: 'pool', shared_washroom: 'pool', drainage: 'pool', guards: 'pet', cctv: 'pet', controlled_entry: 'pet', alarm: 'pet', lighting: 'power' };
const FALLBACK_AMENITY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8"/></svg>';

export function officeShopAmenityIcon(key: string): string {
  if (OFFICE_SHOP_AMENITY_ICONS[key]) return OFFICE_SHOP_AMENITY_ICONS[key];
  const option = AMENITY_OPTIONS.find((item) => item[0] === (OFFICE_SHOP_ICON_ALIASES[key] || key));
  return option ? option[2] : FALLBACK_AMENITY_ICON;
}

// ---------- Which list a category uses ----------

/** The `#amenities-grid` checklist for a category (renderAmenities(cat)). */
export function amenityOptionsFor(category: string | null | undefined): AmenityOption[] {
  if (category === 'hotel') return HOTEL_AMENITY_OPTIONS;
  if (category === 'property') return PROPERTY_AMENITY_OPTIONS;
  return AMENITY_OPTIONS;
}

/** Categories whose grid is replaced by the Amenities Library (venue keeps the visible grid). */
export const isAmenityLibraryNiche = (category: string | null | undefined): boolean =>
  category === 'airbnb' || category === 'hotel' || category === 'property';

// ---------- Library categories ----------

export const LIBRARY_AMENITY_CATEGORIES = ['All', 'Essentials', 'Comfort', 'Kitchen & dining', 'Work & entertainment', 'Outdoor', 'Building & security', 'Family & safety', 'Services'];
export const OFFICE_SHOP_LIBRARY_CATEGORIES = ['All', 'Power', 'Building services', 'Internet', 'Water and washrooms', 'Security'];
export const AMENITY_CATEGORY_TERMS: Record<string, string[]> = {
  Essentials: ['wifi', 'parking', 'power', 'water', 'security', 'smoke', 'alarm', 'camera', 'internet', 'fiber'],
  Comfort: ['heating', 'air conditioning', 'climate', 'bedding', 'pillows', 'hot water', 'curtain', 'towel', 'linen', 'hair dryer', 'furnished', 'unfurnished'],
  'Kitchen & dining': ['kitchen', 'refrigerator', 'fridge', 'coffee', 'breakfast', 'restaurant', 'bar', 'room service'],
  'Work & entertainment': ['workspace', 'tv', 'streaming', 'outlet', 'usb', 'gym', 'fitness', 'elevator', 'desk'],
  Outdoor: ['mountain', 'balcony', 'garden', 'pool', 'bonfire', 'bbq', 'grill', 'hot tub', 'main road', 'school', 'compound'],
  'Building & security': ['security', 'camera', 'power backup', 'elevator', 'parking', 'guard', 'water backup', 'borehole', 'road', 'school'],
  'Family & safety': ['pet', 'smoke', 'alarm', 'security', 'water backup'],
  Services: ['front desk', 'luggage', 'shuttle', 'transport', 'laundry', 'onsite', 'on-site', 'complimentary', 'breakfast', 'room service', 'parking'],
};

/** The first library tab (in tab order) with a term in "key label"; Comfort otherwise. */
export function amenityCategoryFor(key: string, label: string): string {
  const haystack = (key + ' ' + label).toLowerCase();
  for (const category of LIBRARY_AMENITY_CATEGORIES.slice(1)) {
    if (AMENITY_CATEGORY_TERMS[category].some((term) => haystack.includes(term))) return category;
  }
  return 'Comfort';
}

/** The library's category tabs for a listing category. */
export const libraryCategoriesFor = (category: string | null | undefined): string[] =>
  isOfficeShop(category) ? OFFICE_SHOP_LIBRARY_CATEGORIES : LIBRARY_AMENITY_CATEGORIES;

// ---------- Library options ----------

export interface LibraryOption { key: string; label: string; category: string; icon: string }

const libraryOptionsCache = new Map<string, LibraryOption[]>();

/** What the library lists for a category: the office/shop checkboxes, or the grid's checklist. */
export function libraryOptionsFor(category: string | null | undefined): LibraryOption[] {
  const cacheKey = isOfficeShop(category) ? 'office-shop' : String(category);
  const cached = libraryOptionsCache.get(cacheKey);
  if (cached) return cached;
  const options: LibraryOption[] = isOfficeShop(category)
    ? OFFICE_SHOP_AMENITY_GROUPS.flatMap((group) => group.choices.map(([key, label]) => ({ key, label, category: group.category, icon: officeShopAmenityIcon(key) })))
    : amenityOptionsFor(category).map(([key, label, icon]) => ({ key, label, category: amenityCategoryFor(key, label), icon }));
  libraryOptionsCache.set(cacheKey, options);
  return options;
}

/** The library's visible options for the active tab and the search box. */
export function filterLibraryOptions(options: LibraryOption[], activeCategory: string, search: string): LibraryOption[] {
  const query = search.trim().toLowerCase();
  return options.filter((option) => {
    const matchesCategory = activeCategory === 'All' || option.category === activeCategory;
    const matchesSearch = !query || (option.key + ' ' + option.label + ' ' + option.category).toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
}

// ---------- Selection ----------

/** Whether a key is checked in `form.amenities` (the last entry for a key wins). */
export function isAmenityChecked(amenities: AmenitySelections, key: string): boolean {
  let checked = false;
  for (const entry of amenities || []) if (entry && entry.key === key) checked = entry.checked === true;
  return checked;
}

/** Whether a library option is selected: office/shop reads its own store. */
export function isLibraryOptionSelected(category: string | null | undefined, key: string, amenities: AmenitySelections, officeShop: OfficeShopAmenitySelections): boolean {
  return isOfficeShop(category) ? (officeShop || {})[key] === true : isAmenityChecked(amenities, key);
}

/** `form.amenities` with one key set (appended when it is new). */
export function setAmenityChecked(amenities: AmenitySelections, key: string, checked: boolean): AmenitySelections {
  const list = amenities || [];
  if (!list.some((entry) => entry.key === key)) return [...list, { key, checked }];
  return list.map((entry) => (entry.key === key ? { key, checked } : entry));
}

/** getSelectedAmenities(): the checked grid keys for the category, in list order. */
export function selectedAmenityKeys(category: string | null | undefined, amenities: AmenitySelections): string[] {
  return amenityOptionsFor(category).map((option) => option[0]).filter((key) => isAmenityChecked(amenities, key));
}

/** The selected library options for the category, in list order. */
export function selectedLibraryOptions(category: string | null | undefined, amenities: AmenitySelections, officeShop: OfficeShopAmenitySelections): LibraryOption[] {
  return libraryOptionsFor(category).filter((option) => isLibraryOptionSelected(category, option.key, amenities, officeShop));
}

/**
 * The draft snapshot's `amenities` as list.html captured it: every library
 * checkbox for the category with its state (for office/shop, the office/shop
 * checkboxes, which list.html also stored here).
 */
export function amenitySnapshot(category: string | null | undefined, amenities: AmenitySelections, officeShop: OfficeShopAmenitySelections): AmenitySelections {
  return libraryOptionsFor(category).map((option) => ({ key: option.key, checked: isLibraryOptionSelected(category, option.key, amenities, officeShop) }));
}

// ---------- Summary ----------

export const EMPTY_AMENITY_SUMMARY = 'No amenities selected yet.';
export const NO_AMENITY_MATCHES = 'No amenities match this search.';

export interface AmenitySummary {
  count: number;
  /** "N selected" in the library header. */
  countText: string;
  /** Selected labels joined with " · " ('' when none). */
  text: string;
  /** The summary paragraph is hidden when nothing is selected. */
  hidden: boolean;
}

/**
 * syncAmenityLibrarySummary(): the count and summary text. For office/shop it
 * describes `#office-shop-amenities-summary`; otherwise `#amenities-library-summary`.
 */
export function amenitySummary(category: string | null | undefined, amenities: AmenitySelections, officeShop: OfficeShopAmenitySelections): AmenitySummary {
  const selected = selectedLibraryOptions(category, amenities, officeShop);
  const count = selected.length;
  return { count, countText: count + ' selected', text: selected.map((option) => option.label).join(' · '), hidden: count === 0 };
}

/** The Amenities field's label and hint (set by configureHotelLanguage / configurePropertyLanguage). */
export function amenitiesFieldCopy(category: string | null | undefined): { label: string; hint: string } {
  if (category === 'hotel') return { label: 'Room & hotel amenities', hint: 'Choose the comforts and hotel facilities available to guests booking this room.' };
  if (category === 'property') return { label: 'Property features & amenities', hint: 'Select the key features and facilities this property offers to prospective tenants or buyers.' };
  return { label: 'Amenities', hint: 'Select everything this space offers. Shown to guests on the booking page.' };
}
