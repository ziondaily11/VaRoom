-- Finalize a singleton listing document and retire its predecessors in one
-- transaction. The advisory lock serializes concurrent completions for the
-- same listing and document type.
create or replace function public.replace_listing_singleton_document(
  p_document_id uuid,
  p_host_id uuid,
  p_storage_key text,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_listing_id uuid;
  v_document_type text;
  v_retired jsonb;
begin
  select listing_id, document_type
    into v_listing_id, v_document_type
    from public.listing_documents
   where id = p_document_id
     and host_id = p_host_id
     and status = 'verifying'
     and deleted_at is null;

  if not found or v_document_type not in ('property_policy', 'floor_plan', 'commercial_policy') then
    return jsonb_build_object('committed', false, 'retired', '[]'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_listing_id::text || ':' || v_document_type, 0));

  -- Recheck after acquiring the per-singleton lock. Only this transaction can
  -- make the verifying row ready and retire the previous ready rows.
  update public.listing_documents
     set status = 'ready', storage_key = p_storage_key, sha256 = p_sha256,
         updated_at = now()
   where id = p_document_id
     and host_id = p_host_id
     and listing_id = v_listing_id
     and document_type = v_document_type
     and status = 'verifying'
     and deleted_at is null;

  if not found then
    return jsonb_build_object('committed', false, 'retired', '[]'::jsonb);
  end if;

  with retired as (
    update public.listing_documents
       set status = 'deleted', deleted_at = now(), updated_at = now()
     where listing_id = v_listing_id
       and host_id = p_host_id
       and document_type = v_document_type
       and id <> p_document_id
       and status = 'ready'
       and deleted_at is null
     returning id, storage_provider, storage_bucket, storage_key
  )
  select coalesce(jsonb_agg(to_jsonb(retired)), '[]'::jsonb)
    into v_retired
    from retired;

  return jsonb_build_object('committed', true, 'retired', v_retired);
end;
$$;

revoke all on function public.replace_listing_singleton_document(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.replace_listing_singleton_document(uuid, uuid, text, text) to service_role;
