-- property_news_source_health exposes source names, fetch statistics and
-- errors. Supabase's default privileges granted it to anon even though
-- 20260920_000004 only intended authenticated access. Only the service-role
-- worker reads it, so revoke both client roles.
revoke select on public.property_news_source_health from anon;
revoke select on public.property_news_source_health from authenticated;
