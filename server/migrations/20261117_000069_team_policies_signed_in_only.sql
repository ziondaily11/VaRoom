-- Team access fix: signed-out visitors could not read any listing.
--
-- The team policies (000065–000068) were created without a TO clause, so
-- they apply to every role, anon included. Policies on a table are OR-ed,
-- so an anonymous read of listings, listing_photos or
-- listing_booking_details evaluated varoom_can_act_for / varoom_acting_host,
-- which anon may not execute: the whole query failed with 42501 "permission
-- denied for function varoom_can_act_for". The Marketplace, the landing
-- page's listings, public profiles and the booking page broke for visitors.
--
-- Every one of these policies is about the signed-in host or a member of
-- their team, so it can never admit anon. Scoping them to authenticated
-- leaves signed-in access exactly as it was, and anon reads fall back to
-- the public policies they had before. Each statement is safe to re-run.

alter policy "Hosts can manage availability for their own listings" on public.availability to authenticated;
alter policy "Hosts can remove availability for their own listings" on public.availability to authenticated;
alter policy "Hosts can respond to bookings on their own listings" on public.bookings to authenticated;
alter policy "Participants can view their own bookings" on public.bookings to authenticated;
alter policy "Participants can update their own conversation" on public.conversations to authenticated;
alter policy "Participants can view their own conversations" on public.conversations to authenticated;
alter policy "Hosts can insert booking details for their own listings" on public.listing_booking_details to authenticated;
alter policy "Hosts can update booking details for their own listings" on public.listing_booking_details to authenticated;
alter policy listing_booking_details_owner_select on public.listing_booking_details to authenticated;
alter policy "Hosts can add photos to their own listings" on public.listing_photos to authenticated;
alter policy "Hosts can delete photos from their own listings" on public.listing_photos to authenticated;
alter policy listing_photos_owner_select on public.listing_photos to authenticated;
alter policy "Team finance can view the host's listings" on public.listings to authenticated;
alter policy "Team managers can view the host's listings" on public.listings to authenticated;
alter policy message_attachments_participant_select on public.message_attachments to authenticated;
alter policy messages_participant_select on public.messages to authenticated;

-- Rollback: the same statements with "to public".
