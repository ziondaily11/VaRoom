-- Team access, part 2: Managers work on the host's listings.
--
-- The listing wizard reads and writes a listing's booking details, photos and
-- open dates directly; these rules allowed only the owner. They now allow
-- whoever may act for the host as a Manager (varoom_can_act_for, which is
-- the owner too, so owners keep exactly what they had). Listing rows, media
-- and documents go through the server, which acts for the host the same way.
-- Each statement is safe to re-run.

drop policy if exists "Hosts can manage availability for their own listings" on public.availability;
create policy "Hosts can manage availability for their own listings" on public.availability
  for insert with check (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = availability.listing_id), 'manager'));
drop policy if exists "Hosts can remove availability for their own listings" on public.availability;
create policy "Hosts can remove availability for their own listings" on public.availability
  for delete using (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = availability.listing_id), 'manager'));

drop policy if exists "Hosts can insert booking details for their own listings" on public.listing_booking_details;
create policy "Hosts can insert booking details for their own listings" on public.listing_booking_details
  for insert with check (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = listing_booking_details.listing_id), 'manager'));
drop policy if exists "Hosts can update booking details for their own listings" on public.listing_booking_details;
create policy "Hosts can update booking details for their own listings" on public.listing_booking_details
  for update using (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = listing_booking_details.listing_id), 'manager'));
drop policy if exists listing_booking_details_owner_select on public.listing_booking_details;
create policy listing_booking_details_owner_select on public.listing_booking_details
  for select using (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = listing_booking_details.listing_id), 'manager'));

drop policy if exists "Hosts can add photos to their own listings" on public.listing_photos;
create policy "Hosts can add photos to their own listings" on public.listing_photos
  for insert with check (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = listing_photos.listing_id), 'manager'));
drop policy if exists "Hosts can delete photos from their own listings" on public.listing_photos;
create policy "Hosts can delete photos from their own listings" on public.listing_photos
  for delete using (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = listing_photos.listing_id), 'manager'));
drop policy if exists listing_photos_owner_select on public.listing_photos;
create policy listing_photos_owner_select on public.listing_photos
  for select using (public.varoom_can_act_for((select l.host_id from public.listings l where l.id = listing_photos.listing_id), 'manager'));

-- Rollback: recreate each policy above with (auth.uid() = <the listing's host_id>) in place of varoom_can_act_for(…).
