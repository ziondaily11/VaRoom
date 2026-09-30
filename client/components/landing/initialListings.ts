import { Listing } from './types';

// Real verified listing records matching the VaRoom Supabase database.
// Amenities strictly reflect the stored listing_booking_details from Supabase.
export const INITIAL_LISTINGS: Listing[] = [
  {
    id: "218f126a-20d6-443b-bf24-546b5fd7366a",
    title: "Cozy Airbnb near the Ocean in Mombasa",
    category: "airbnb",
    location: "Bamburi, Mombasa",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/53f971b0-8489-4886-834f-bcc37a2469cd/218f126a-20d6-443b-bf24-546b5fd7366a/1790312907554_0_Airbnb_d_voile_la_liste_des_maisons_les_plus_lik_es_sur_Instagram.jpg",
    price: 8000,
    priceUnit: "night",
    guests: 3,
    sizeOrType: "2 bedroom, twin & king beds",
    amenities: ["wifi", "kitchen", "heating", "tv", "workspace", "balcony"],
    verified: true,
    hostName: "Zion Daily"
  },
  {
    id: "e68ec194-7926-4941-8433-7286e73276b4",
    title: "Deluxe Modern AirBnB",
    category: "airbnb",
    location: "Kileleshwa, Nairobi",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/53f971b0-8489-4886-834f-bcc37a2469cd/e68ec194-7926-4941-8433-7286e73276b4/1788771620337_0_Luxe_stay_Airbnb.jpg",
    price: 3799,
    priceUnit: "night",
    guests: 2,
    sizeOrType: "1 bedroom, studio",
    amenities: ["wifi", "parking", "kitchen", "tv", "power"],
    verified: true,
    hostName: "Zion Daily"
  },
  {
    id: "d7971326-d956-4e93-ae49-111bbf691e7e",
    title: "Premier Hotel & Suites",
    category: "hotel",
    location: "Upper Hill, Nairobi",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/c756281f-1f4e-43b8-a120-ee08b2cacc43/d7971326-d956-4e93-ae49-111bbf691e7e/1790318845792_0_e2b868b771d42882c1ed04f81fa10303.jpg",
    price: 12000,
    priceUnit: "night",
    guests: 2,
    sizeOrType: "Executive Suite",
    amenities: ["wifi", "parking", "kitchen", "tv", "bonfire"],
    verified: true,
    hostName: "VaRoom Host"
  },
  {
    id: "346dd7cb-5a69-4635-8965-fbabb0f52c66",
    title: "Luxury stays",
    category: "airbnb",
    location: "Kikuyu, Nairobi",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/photos/production/listing-photos/53f971b0-8489-4886-834f-bcc37a2469cd/2942be0e-40a4-460e-95cc-92417d3b11c9/original.jpg",
    price: 3500,
    priceUnit: "night",
    guests: 2,
    sizeOrType: "Studio",
    amenities: ["wifi", "kitchen", "workspace", "air_conditioning", "pool", "gym"],
    verified: true,
    hostName: "VaRoom Host"
  },
  {
    id: "00dcc40d-889c-4d4a-82d9-cf2d33dacbf0",
    title: "Cozy Studio",
    category: "airbnb",
    location: "Bamburi, Mombasa",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/photos/production/listing-photos/aedcec42-ea01-42bd-b364-ddcf7e487bd2/317d61db-ff70-46c6-b6b5-a112cd266894/original.jpg",
    price: 8000,
    priceUnit: "night",
    guests: 2,
    sizeOrType: "Studio apartment",
    amenities: ["wifi", "parking", "tv", "workspace", "balcony"],
    verified: true,
    hostName: "Billionaire ZION"
  },
  {
    id: "fc9553a4-9bb0-4305-b985-a614a505966a",
    title: "Deluxe stays",
    category: "airbnb",
    location: "Ngong Road, Nairobi",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/photos/production/listing-photos/53f971b0-8489-4886-834f-bcc37a2469cd/564bafee-07ea-447b-b749-b31621ab3c3c/original.jpg",
    price: 4000,
    priceUnit: "night",
    guests: 4,
    sizeOrType: "2 bedroom",
    amenities: ["wifi", "kitchen", "workspace", "bonfire"],
    verified: true,
    hostName: "Zion Daily"
  },
  {
    id: "5adc8f8d-a253-4793-8d2c-a29d02642a45",
    title: "Deluxe rooms",
    category: "hotel",
    location: "Westlands, Nairobi",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/photos/production/listing-photos/53f971b0-8489-4886-834f-bcc37a2469cd/b6d655f4-3d98-4c33-ae8b-6f81e3a9dc7c/original.jpg",
    price: 8000,
    priceUnit: "night",
    guests: 2,
    sizeOrType: "Deluxe Hotel Room",
    amenities: ["wifi", "parking", "tv", "workspace", "breakfast", "power", "air_conditioning", "gym", "hair_dryer"],
    verified: true,
    hostName: "VaRoom Host"
  },
  {
    id: "9719a866-b1c0-4431-bf23-563fdff919f4",
    title: "Luxurious Stays",
    category: "airbnb",
    location: "Kilimani, Nairobi",
    photoUrl: "https://deaphymimdaygeavhyek.supabase.co/storage/v1/object/public/listing-photos/photos/production/listing-photos/53f971b0-8489-4886-834f-bcc37a2469cd/b9432e18-6ef8-43d9-9aa8-dd921e549d4d/original.jpg",
    price: 3800,
    priceUnit: "night",
    guests: 2,
    sizeOrType: "1 bedroom",
    amenities: ["wifi", "kitchen", "heating"],
    verified: true,
    hostName: "Zion Daily"
  }
];
