-- One-off: listing d209842f (published 2026-11-27) holds the same 6 photos 4 times,
-- one set per Publish attempt (fixed by migration 088 and the wizard's photo fingerprint).
-- Keeps the first complete set (uploaded 15:23-15:27 UTC) and deletes the 18 later rows.
-- Safe to re-run: a second run deletes nothing. Run in the Supabase SQL Editor.
-- The 18 files left unused in R2 are removed separately, after this has run.

-- Check first (read only): expect 6 rows "keep", 18 rows "delete".
select case when created_at < '2026-11-27 15:30:00+00' then 'keep' else 'delete' end as action, count(*)
from public.listing_photos
where listing_id = 'd209842f-529f-4e7a-aed0-b422e68c4e23'
group by 1;

-- The cleanup.
delete from public.listing_photos
where listing_id = 'd209842f-529f-4e7a-aed0-b422e68c4e23'
  and created_at >= '2026-11-27 15:30:00+00';

-- Verify: expect 6.
select count(*) from public.listing_photos where listing_id = 'd209842f-529f-4e7a-aed0-b422e68c4e23';

-- Undo: not possible from SQL once deleted; the 18 rows were duplicates of the 6 kept photos.
