-- Listing documents are distinct from property_media (which only stores
-- photos/videos). The metadata table is private; all access goes through the
-- authenticated server routes which issue short-lived R2 download URLs.
create table if not exists public.listing_documents (
  id uuid primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in (
    'property_policy', 'floor_plan', 'commercial_policy', 'ownership_management'
  )),
  storage_provider text not null default 'r2' check (storage_provider in ('r2', 'supabase')),
  storage_bucket text not null,
  storage_key text not null unique,
  original_filename text not null,
  -- application/octet-stream is reserved for legacy Supabase objects whose
  -- old path does not reveal a supported file type. New R2 uploads are
  -- restricted to the explicit allowlist by the API.
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream')),
  file_size_bytes bigint check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 15728640)),
  sha256 text,
  status text not null default 'pending' check (status in ('pending', 'verifying', 'ready', 'failed', 'deleted')),
  visibility text not null check (visibility in ('listing', 'host_only')),
  upload_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  storage_cleaned_at timestamptz
);

create index if not exists listing_documents_listing_ready_idx
  on public.listing_documents (listing_id, document_type, created_at desc)
  where status = 'ready' and deleted_at is null;
create index if not exists listing_documents_host_idx
  on public.listing_documents (host_id, created_at desc);
create index if not exists listing_documents_pending_expiry_idx
  on public.listing_documents (upload_expires_at)
  where status in ('pending', 'verifying');

create or replace function public.varoom_validate_listing_document_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  listing_category text;
begin
  select category into listing_category
    from public.listings where id = new.listing_id and host_id = new.host_id;
  if listing_category is null then
    raise exception 'Document host must own the associated listing';
  end if;
  if (listing_category = 'property' and new.document_type <> 'property_policy')
    or (listing_category in ('office', 'shop') and new.document_type not in ('floor_plan', 'commercial_policy', 'ownership_management'))
    or listing_category not in ('property', 'office', 'shop') then
    raise exception 'Document type is not supported for this listing category';
  end if;
  if new.document_type = 'ownership_management' and new.visibility <> 'host_only' then
    raise exception 'Ownership and management documents must remain host-only';
  end if;
  if new.document_type <> 'ownership_management' and new.visibility <> 'listing' then
    raise exception 'Supporting listing documents must use listing visibility';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists listing_documents_owner_category_check on public.listing_documents;
create trigger listing_documents_owner_category_check
  before insert or update of listing_id, host_id, document_type, visibility
  on public.listing_documents
  for each row execute function public.varoom_validate_listing_document_owner();

-- A listing must not be reclassified or transferred while its document rows
-- are still attached. This prevents a commercial document from becoming a
-- property attachment (or crossing host ownership) after upload validation.
create or replace function public.varoom_guard_listing_document_category_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (new.host_id is distinct from old.host_id or new.category is distinct from old.category)
     and exists (
       select 1 from public.listing_documents d
       where d.listing_id = old.id
         and d.deleted_at is null and d.status <> 'deleted'
         and (
           d.host_id <> new.host_id
           or (new.category = 'property' and d.document_type <> 'property_policy')
           or (new.category in ('office', 'shop') and d.document_type not in ('floor_plan', 'commercial_policy', 'ownership_management'))
           or new.category not in ('property', 'office', 'shop')
         )
     ) then
    raise exception 'Listing category or owner cannot change while incompatible documents are attached';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_document_category_guard on public.listings;
create trigger listings_document_category_guard
  before update of host_id, category on public.listings
  for each row execute function public.varoom_guard_listing_document_category_change();

alter table public.listing_documents enable row level security;
revoke all on public.listing_documents from public, anon, authenticated;
grant all on public.listing_documents to service_role;

comment on table public.listing_documents is
  'Private metadata for listing support documents stored in Cloudflare R2. Access is mediated by authenticated server routes; ownership documents are host-only.';
comment on column public.listing_documents.storage_key is 'Private R2 object key; never expose as a public URL.';

-- Existing versions stored paths inside the publicly selectable booking JSON.
-- Move those references to the private document table before removing them
-- from the public listing data. Legacy Supabase objects stay in place and are
-- served by the same authorization route using short-lived signed URLs.
insert into public.listing_documents (
  id, listing_id, host_id, document_type, storage_provider, storage_bucket,
  storage_key, original_filename, mime_type, file_size_bytes, status, visibility
)
select gen_random_uuid(), l.id, l.host_id, 'property_policy', 'supabase', 'listing-photos',
       d.policy_storage_path,
       coalesce(nullif(regexp_replace(d.policy_storage_path, '^.*/', ''), ''), 'property-policy-document'),
       case lower(regexp_replace(d.policy_storage_path, '^.*\.', ''))
         when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg'
         when 'png' then 'image/png' when 'webp' then 'image/webp' when 'gif' then 'image/gif'
         when 'pdf' then 'application/pdf' else 'application/octet-stream' end,
       null, 'ready', 'listing'
from public.listing_booking_details d
join public.listings l on l.id = d.listing_id
where l.category = 'property' and nullif(d.policy_storage_path, '') is not null
on conflict (storage_key) do nothing;

insert into public.listing_documents (
  id, listing_id, host_id, document_type, storage_provider, storage_bucket,
  storage_key, original_filename, mime_type, file_size_bytes, status, visibility
)
select gen_random_uuid(), l.id, l.host_id, docs.document_type, 'supabase', 'listing-photos',
       docs.storage_key,
       coalesce(nullif(regexp_replace(docs.storage_key, '^.*/', ''), ''), 'listing-document'),
       case lower(regexp_replace(docs.storage_key, '^.*\.', ''))
         when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg'
         when 'png' then 'image/png' when 'webp' then 'image/webp' when 'gif' then 'image/gif'
         when 'pdf' then 'application/pdf' else 'application/octet-stream' end,
       null, 'ready', case when docs.document_type = 'ownership_management' then 'host_only' else 'listing' end
from public.listing_booking_details d
join public.listings l on l.id = d.listing_id
cross join lateral (
  select 'floor_plan'::text as document_type, d.office_shop_details #>> '{documents,floor_plan_path}' as storage_key
  union all
  select 'commercial_policy', d.office_shop_details #>> '{documents,policy_path}'
  union all
  select 'ownership_management', paths.storage_key
  from jsonb_array_elements_text(
    case when jsonb_typeof(d.office_shop_details #> '{documents,management_document_paths}') = 'array'
      then d.office_shop_details #> '{documents,management_document_paths}' else '[]'::jsonb end
  ) as paths(storage_key)
) docs
where l.category in ('office', 'shop') and nullif(docs.storage_key, '') is not null
on conflict (storage_key) do nothing;

update public.listing_booking_details details
set policy_storage_path = null
from public.listings listing
where listing.id = details.listing_id
  and listing.category = 'property'
  and details.policy_storage_path is not null
  and exists (
    select 1 from public.listing_documents document
    where document.listing_id = details.listing_id
      and document.document_type = 'property_policy'
      and document.storage_key = details.policy_storage_path
  );

update public.listing_booking_details details
set office_shop_details = jsonb_set(
  details.office_shop_details,
  '{documents}',
  coalesce(details.office_shop_details -> 'documents', '{}'::jsonb) - 'floor_plan_path' - 'policy_path' - 'management_document_paths',
  true
)
from public.listings listing
where listing.id = details.listing_id
  and listing.category in ('office', 'shop')
  and details.office_shop_details ? 'documents'
  -- Keep any path in its original field if its metadata row could not be
  -- created (for example, if malformed legacy data reused another object's key).
  and not exists (
    select 1
    from (
      select details.office_shop_details #>> '{documents,floor_plan_path}' as storage_key
      union all
      select details.office_shop_details #>> '{documents,policy_path}'
      union all
      select jsonb_array_elements_text(
        case when jsonb_typeof(details.office_shop_details #> '{documents,management_document_paths}') = 'array'
          then details.office_shop_details #> '{documents,management_document_paths}' else '[]'::jsonb end
      )
    ) legacy(storage_key)
    where legacy.storage_key is not null
      and not exists (
        select 1 from public.listing_documents document
        where document.listing_id = details.listing_id
          and document.storage_key = legacy.storage_key
      )
  );

-- Draft revisions let the server reject delayed or concurrent writes instead
-- of silently replacing a newer saved state with an older tab's snapshot.
alter table public.host_listing_drafts
  add column if not exists revision integer not null default 0 check (revision >= 0);
