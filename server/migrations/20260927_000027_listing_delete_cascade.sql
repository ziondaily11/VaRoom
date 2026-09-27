-- Ensure listing deletion cascades to all listing-owned media and reviews.
-- This keeps the application delete flow and database integrity contract aligned.

-- Remove orphaned rows that would prevent FK enforcement.
delete from public.property_media pm
where not exists (
  select 1 from public.listings l where l.id = pm.property_id
);

delete from public.reviews r
where not exists (
  select 1 from public.listings l where l.id = r.listing_id
);

-- property_media: one-to-many media rows owned by a listing.
alter table public.property_media
drop constraint if exists property_media_property_id_fkey;

alter table public.property_media
add constraint property_media_property_id_fkey
foreign key (property_id) references public.listings(id) on delete cascade;

-- reviews: a listing may have multiple reviews, but listing deletion should remove them.
alter table public.reviews
drop constraint if exists reviews_listing_id_fkey;

alter table public.reviews
add constraint reviews_listing_id_fkey
foreign key (listing_id) references public.listings(id) on delete cascade;

-- Ensure the listing delete endpoint and DB cascade contract stay aligned.
comment on constraint property_media_property_id_fkey on public.property_media is 'Property media rows are deleted with the owning listing.';
comment on constraint reviews_listing_id_fkey on public.reviews is 'Reviews are deleted with the owning listing.';
