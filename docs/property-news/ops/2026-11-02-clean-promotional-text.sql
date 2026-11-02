-- Remove publisher promos and paywall boxes from published Property News
-- stories (2026-11-02). Rollback: 2026-11-02-clean-promotional-text-rollback.sql
-- Each statement is atomic and safe to re-run. The previous body of every
-- changed story is saved in its news_events entry.
--
-- Previewed read-only on production before writing: 3 paywalled Standard
-- bodies; 17 Tuko, 2 Standard and 1 Citizen bodies cleaned; no promo line left
-- afterwards; ordinary sentences such as "...pay attention. Of all..." kept.

-- 1. Paywall boxes ("Premium Article ... Pay via ... Already a subscriber?").
--    With no body, the story page shows the summary and links to the source.
with paywalled as (
  select id, source_id, varoom_body
    from news_items
   where review_status = 'published' and varoom_body is not null
     and ((lower(varoom_body) like '%premium article%')::int
          + (lower(varoom_body) like '%already a subscriber%')::int
          + (lower(varoom_body) like '%subscribe for full access%')::int
          + (lower(varoom_body) like '%unlimited access to all premium content%')::int
          + (lower(varoom_body) like '%continue reading%')::int
          + (lower(varoom_body) like '%secure payments%')::int) >= 2
), updated as (
  update news_items i set varoom_body = null
    from paywalled p
   where i.id = p.id
  returning i.id
)
insert into news_events(news_id, source_id, event_type, payload)
select p.id, p.source_id, 'item_body_cleaned',
       jsonb_build_object('change', 'clean-promotional-text-2026-11-02', 'reason', 'paywall', 'previous_body', p.varoom_body)
  from paywalled p join updated u on u.id = p.id;

-- 2. Promo lines: Tuko "PAY ATTENTION:" / "READ ALSO:" / "Source: TUKO.co.ke",
--    newsletter prompts, and lines that are only a social or advert label.
with cleaned as (
  select id, source_id, varoom_body as before,
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(varoom_body,
           '^[ \t]*(PAY ATTENTION|READ ALSO|ALSO READ|READ MORE)[ \t]*:[^\n]*(\n|$)', '', 'gn'),
           '(?i)^[ \t]*Source:[ \t]*TUKO\.co\.ke[ \t]*(\n|$)', '', 'gn'),
           '(?i)^[ \t]*(Stay informed\.[ \t]*)?Subscribe to (our|the) newsletter[^\n]{0,80}(\n|$)', '', 'gn'),
           '(?i)^[ \t]*(Follow us( on [A-Za-z ]{1,30})?|WhatsApp|Telegram|Facebook|Twitter|Instagram|YouTube|TikTok|LinkedIn|Share( this( article)?)?|Advertisement|Sponsored)[ \t]*:?[ \t]*(\n|$)', '', 'gn') as after
    from news_items
   where review_status = 'published' and varoom_body is not null
), changed as (
  select * from cleaned where after <> before
), updated as (
  update news_items i set varoom_body = btrim(c.after, E' \n\t')
    from changed c
   where i.id = c.id
  returning i.id
)
insert into news_events(news_id, source_id, event_type, payload)
select c.id, c.source_id, 'item_body_cleaned',
       jsonb_build_object('change', 'clean-promotional-text-2026-11-02', 'reason', 'promotional_lines', 'previous_body', c.before)
  from changed c join updated u on u.id = c.id;

select count(*) filter (where varoom_body ~ 'PAY ATTENTION|Source: TUKO\.co\.ke') as promo_bodies_left,
       count(*) filter (where lower(varoom_body) like '%already a subscriber%') as paywall_bodies_left
  from news_items where review_status = 'published';
