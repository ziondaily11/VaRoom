-- Chat photos keep their size (as shown, after EXIF rotation) so a photo
-- bubble opens at its real size instead of growing once the image loads.
-- New photos get it from the sender's browser at upload; older ones from
-- server/scripts/backfill-chat-photo-dimensions.js. Null until then.
-- Safe to re-run. Apply before deploying the server, which selects these.
--
-- Check before running (read only; works before this migration):
--   Neither column exists yet (expect 0):
--     select count(*) from information_schema.columns
--     where table_schema = 'public' and table_name = 'message_attachments'
--       and column_name in ('width', 'height');
--
-- Undo:
--   alter table public.message_attachments
--     drop constraint if exists message_attachments_dimensions_positive,
--     drop column if exists width,
--     drop column if exists height;

alter table public.message_attachments
  add column if not exists width integer,
  add column if not exists height integer;

alter table public.message_attachments
  drop constraint if exists message_attachments_dimensions_positive;

alter table public.message_attachments
  add constraint message_attachments_dimensions_positive
  check ((width is null or width > 0) and (height is null or height > 0));
