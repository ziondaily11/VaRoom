-- Store intrinsic dimensions for legacy listing photos so feeds can reserve
-- media space before requesting lazy-loaded image bytes. Existing rows remain
-- nullable until the metadata backfill script has processed them.
alter table public.listing_photos
  add column if not exists width integer,
  add column if not exists height integer;

alter table public.listing_photos
  drop constraint if exists listing_photos_dimensions_positive;

alter table public.listing_photos
  add constraint listing_photos_dimensions_positive
  check ((width is null or width > 0) and (height is null or height > 0));
