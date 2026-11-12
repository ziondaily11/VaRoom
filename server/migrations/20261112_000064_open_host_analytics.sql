-- Analytics is open to every host for now: the subscription check in
-- host_analytics_overview always passes. To restore the paywall, re-run the
-- host_has_analytics_access definition from 20261104_000057_host_analytics_v2.sql.

create or replace function public.host_has_analytics_access(p_host uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_host is not null;
$$;

revoke all on function public.host_has_analytics_access(uuid) from public, anon, authenticated;
