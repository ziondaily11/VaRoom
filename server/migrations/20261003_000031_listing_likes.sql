create table if not exists public.listing_likes (
  client_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, listing_id)
);

create index if not exists listing_likes_listing_id_idx
  on public.listing_likes (listing_id);

alter table public.listing_likes enable row level security;

drop policy if exists listing_likes_authenticated_select on public.listing_likes;
create policy listing_likes_authenticated_select
  on public.listing_likes for select to authenticated
  using (client_id = auth.uid());

drop policy if exists listing_likes_owner_insert on public.listing_likes;
create policy listing_likes_owner_insert
  on public.listing_likes for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists listing_likes_owner_delete on public.listing_likes;
create policy listing_likes_owner_delete
  on public.listing_likes for delete to authenticated
  using (client_id = auth.uid());

grant select, insert, delete on public.listing_likes to authenticated;

create or replace function public.get_listing_like_summaries(p_listing_ids uuid[])
returns table (listing_id uuid, like_count bigint, liked_by_current_user boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
    select requested.listing_id,
           count(likes.listing_id)::bigint,
           coalesce(bool_or(likes.client_id = auth.uid()), false)
      from (
        select distinct unnest(coalesce(p_listing_ids, array[]::uuid[])) as listing_id
      ) requested
      left join public.listing_likes likes on likes.listing_id = requested.listing_id
     group by requested.listing_id;
end;
$$;

create or replace function public.set_listing_like(p_listing_id uuid, p_liked boolean)
returns table (like_count bigint, liked_by_current_user boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_listing_id is null or p_liked is null then
    raise exception 'A listing and desired like state are required' using errcode = '22023';
  end if;

  if p_liked then
    insert into public.listing_likes (client_id, listing_id)
    values (auth.uid(), p_listing_id)
    on conflict (client_id, listing_id) do nothing;
  else
    delete from public.listing_likes
     where client_id = auth.uid()
       and listing_id = p_listing_id;
  end if;

  return query
    select summary.like_count, summary.liked_by_current_user
      from public.get_listing_like_summaries(array[p_listing_id]) summary;
end;
$$;

revoke all on function public.get_listing_like_summaries(uuid[]) from public, anon;
grant execute on function public.get_listing_like_summaries(uuid[]) to authenticated;
revoke all on function public.set_listing_like(uuid, boolean) from public, anon;
grant execute on function public.set_listing_like(uuid, boolean) to authenticated;
