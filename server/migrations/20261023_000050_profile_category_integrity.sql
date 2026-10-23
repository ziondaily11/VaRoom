-- Category integrity: categories are created only with at least one host-owned
-- listing and all writes go through the authenticated RPCs below.
-- Legacy empty categories are retained as historical records but are invisible
-- everywhere; no unrelated listing or media data is touched by this migration.

create or replace function public.varoom_profile_category_visible(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_category_listings
    where category_id = p_category_id
  );
$$;

create or replace function public.varoom_delete_empty_profile_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profile_categories c
  where c.id = old.category_id
    and not exists (
      select 1 from public.profile_category_listings pcl
      where pcl.category_id = old.category_id
    );
  return old;
end;
$$;

drop trigger if exists profile_category_listing_remove_empty_category on public.profile_category_listings;
create trigger profile_category_listing_remove_empty_category
after delete on public.profile_category_listings
for each row execute function public.varoom_delete_empty_profile_category();

create or replace function public.profile_category_limit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id uuid := auth.uid();
  v_is_premium boolean;
begin
  if v_host_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.host_subscriptions hs
    where hs.host_id = v_host_id
      and hs.status in ('active', 'past_due', 'cancel_requested')
      and (hs.current_period_end is null or hs.current_period_end > now())
      and hs.plan_id in ('pro', 'property_premium', 'shops_premium')
  ) into v_is_premium;

  return case when v_is_premium then 5 else 1 end;
end;
$$;

create or replace function public.save_profile_category_with_listings(
  p_category_id uuid,
  p_name text,
  p_listing_ids uuid[]
)
returns public.profile_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id uuid := auth.uid();
  v_category public.profile_categories;
  v_clean_name text := btrim(coalesce(p_name, ''));
  v_limit integer;
  v_category_count integer;
  v_listing_count integer;
begin
  if v_host_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_host_id and role = 'host') then
    raise exception 'Only hosts may manage profile categories' using errcode = '42501';
  end if;
  if coalesce(array_length(p_listing_ids, 1), 0) = 0 then
    raise exception 'Select at least one listing before saving a category' using errcode = 'P0001';
  end if;

  -- Serialise creation per host so concurrent browser tabs cannot exceed the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_host_id::text, 0));

  select count(*) into v_listing_count
  from public.listings l
  where l.host_id = v_host_id
    and l.id in (select distinct unnest(p_listing_ids));
  if v_listing_count <> (select count(distinct listing_id) from unnest(p_listing_ids) as selected(listing_id)) then
    raise exception 'One or more selected listings do not belong to this host' using errcode = '42501';
  end if;

  if p_category_id is null then
    if char_length(v_clean_name) not between 1 and 60 then
      raise exception 'Category name must be between 1 and 60 characters' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.profile_categories
      where host_id = v_host_id and lower(btrim(name)) = lower(v_clean_name)
    ) then
      raise exception 'That category name already exists' using errcode = '23505';
    end if;

    v_limit := public.profile_category_limit();
    select count(*) into v_category_count
    from public.profile_categories c
    where c.host_id = v_host_id
      and exists (select 1 from public.profile_category_listings pcl where pcl.category_id = c.id);
    if v_category_count >= v_limit then
      raise exception '%', case when v_limit = 5
        then 'Premium hosts can create up to 5 categories.'
        else 'Your plan allows 1 category.' end using errcode = 'P0001';
    end if;

    insert into public.profile_categories (host_id, name, sort_order)
    values (
      v_host_id,
      v_clean_name,
      coalesce((select max(sort_order) + 1 from public.profile_categories where host_id = v_host_id), 0)
    ) returning * into v_category;
  else
    select * into v_category
    from public.profile_categories
    where id = p_category_id and host_id = v_host_id
    for update;
    if not found then
      raise exception 'Category not found' using errcode = '42501';
    end if;
  end if;

  -- Insert first so the empty-category trigger never observes an empty category
  -- during a replacement assignment. The primary key prevents duplicate links.
  insert into public.profile_category_listings (category_id, host_id, listing_id)
  select v_category.id, v_host_id, selected.listing_id
  from (select distinct unnest(p_listing_ids) as listing_id) selected
  on conflict (category_id, listing_id) do nothing;

  delete from public.profile_category_listings
  where category_id = v_category.id
    and listing_id <> all(p_listing_ids);

  return v_category;
end;
$$;

create or replace function public.rename_profile_category(p_category_id uuid, p_name text)
returns public.profile_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id uuid := auth.uid();
  v_clean_name text := btrim(coalesce(p_name, ''));
  v_category public.profile_categories;
begin
  if v_host_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  if char_length(v_clean_name) not between 1 and 60 then
    raise exception 'Category name must be between 1 and 60 characters' using errcode = '22023';
  end if;
  select * into v_category from public.profile_categories
  where id = p_category_id and host_id = v_host_id for update;
  if not found then raise exception 'Category not found' using errcode = '42501'; end if;
  if exists (select 1 from public.profile_categories where host_id = v_host_id and id <> p_category_id and lower(btrim(name)) = lower(v_clean_name)) then
    raise exception 'That category name already exists' using errcode = '23505';
  end if;
  update public.profile_categories set name = v_clean_name, updated_at = now()
  where id = p_category_id returning * into v_category;
  return v_category;
end;
$$;

create or replace function public.delete_profile_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  delete from public.profile_categories where id = p_category_id and host_id = auth.uid();
  if not found then raise exception 'Category not found' using errcode = '42501'; end if;
end;
$$;

-- Reads expose only categories that contain listings. Browser writes are denied;
-- the RPCs above enforce ownership, limits, and assignment integrity.
drop policy if exists "Profile categories are publicly readable" on public.profile_categories;
drop policy if exists "Hosts manage their own profile categories" on public.profile_categories;
create policy "Nonempty profile categories are publicly readable"
  on public.profile_categories for select
  using (public.varoom_profile_category_visible(id));

drop policy if exists "Profile category listings are publicly readable" on public.profile_category_listings;
drop policy if exists "Hosts manage their own category assignments" on public.profile_category_listings;
create policy "Listings in nonempty profile categories are publicly readable"
  on public.profile_category_listings for select
  using (public.varoom_profile_category_visible(category_id));

revoke all on function public.profile_category_limit() from public, anon;
revoke all on function public.save_profile_category_with_listings(uuid, text, uuid[]) from public, anon;
revoke all on function public.rename_profile_category(uuid, text) from public, anon;
revoke all on function public.delete_profile_category(uuid) from public, anon;
grant execute on function public.profile_category_limit() to authenticated;
grant execute on function public.save_profile_category_with_listings(uuid, text, uuid[]) to authenticated;
grant execute on function public.rename_profile_category(uuid, text) to authenticated;
grant execute on function public.delete_profile_category(uuid) to authenticated;
