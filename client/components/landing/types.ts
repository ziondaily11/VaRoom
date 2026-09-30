export interface Listing {
  id: string;
  title: string;
  category: string;
  location: string;
  photoUrl: string | null;
  price: number | null;
  priceUnit: string;
  guests: number | null;
  sizeOrType: string | null;
  amenities: string[];
  verified: boolean;
  hostName: string;
}

export interface TrustItem {
  id: string;
  label: string;
}

export interface NavLink {
  label: string;
  href: string;
  isAnchor?: boolean;
}
