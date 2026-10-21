-- Country is a platform default, not a host-entered field. Keep legacy and
-- direct API listing inserts consistent with the listing flow.
alter table public.listings
  alter column country set default 'Kenya';

update public.listings
set country = 'Kenya'
where country is null;
