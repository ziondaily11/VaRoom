-- Reverses 2026-11-02-phase5-source-rebuild.sql. Each statement is atomic.

-- 1. Reactivate the sources Phase 5 deactivated.
update news_sources set active = true, updated_at = now()
 where id in (select source_id from news_events
               where event_type = 'source_deactivated' and payload->>'change' = 'phase5-2026-11-02');

-- 2. Restore the previous configuration saved in each source_config_updated event.
update news_sources s
   set fetch_method = e.payload->'previous'->>'fetch_method',
       base_url = e.payload->'previous'->>'base_url',
       parser_config = e.payload->'previous'->'parser_config',
       updated_at = now()
  from news_events e
 where e.source_id = s.id
   and e.event_type = 'source_config_updated'
   and e.payload->>'change' = 'phase5-2026-11-02';

-- 3. Stop collecting the source Phase 5 added (kept, with any stories it collected).
update news_sources set active = false, updated_at = now()
 where base_url = 'https://www.tuko.co.ke/business-economy';
