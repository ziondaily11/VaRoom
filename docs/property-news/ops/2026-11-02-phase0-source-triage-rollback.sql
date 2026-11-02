-- Reverses 2026-11-02-phase0-source-triage.sql. Each statement is atomic.

update news_sources set active = true, updated_at = now()
 where id in (select source_id from news_events
               where event_type = 'source_deactivated' and payload->>'change' = 'phase0-2026-11-02');

update news_sources set parser_config = parser_config - 'allowed_hosts', updated_at = now()
 where id = '00196009-88a3-4b4a-a474-74567ef06448';
