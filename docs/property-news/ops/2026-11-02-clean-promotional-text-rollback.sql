-- Reverses 2026-11-02-clean-promotional-text.sql: restores each story's body
-- from the earliest cleanup event saved for it.
update news_items i
   set varoom_body = e.payload->>'previous_body'
  from (
    select distinct on (news_id) news_id, payload
      from news_events
     where event_type = 'item_body_cleaned' and payload->>'change' = 'clean-promotional-text-2026-11-02'
     order by news_id, created_at
  ) e
 where i.id = e.news_id;
