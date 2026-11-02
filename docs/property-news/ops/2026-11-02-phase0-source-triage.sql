-- Phase 0 source triage (2026-11-02). APPLIED to production on 2026-11-02.
-- Rollback: 2026-11-02-phase0-source-triage-rollback.sql
-- Each statement is atomic and safe to re-run: only rows that actually change
-- get an audit event.

with changes(id, reason) as (values
  -- 0.2 domains that do not resolve
  ('708b3efd-f872-48c3-8693-fae95914755b'::uuid, 'dns_error: domain does not resolve'),
  ('aa675acc-a75f-4bb9-be0e-26e61ff9ede7'::uuid, 'dns_error: domain does not resolve'),
  ('6caea0d1-e9ba-4a02-b80c-ac498e09617c'::uuid, 'dns_error: domain does not resolve'),
  ('98f4f1be-b93f-43fc-8ae0-be441beecae4'::uuid, 'dns_error: domain does not resolve'),
  ('21fd5476-956c-4926-890d-0618d1c8c800'::uuid, 'dns_error: domain does not resolve'),
  ('c1040287-2734-4a8c-aa53-e2b529d277e0'::uuid, 'dns_error: domain does not resolve'),
  ('4a30644c-7667-4b85-97a4-3e7797141a4d'::uuid, 'dns_error: domain does not resolve'),
  ('a30bb853-9cca-49e8-b83c-de1a4fa87cb3'::uuid, 'dns_error: domain does not resolve'),
  ('4860575c-adf6-4579-a93a-41622f90bd3b'::uuid, 'dns_error: domain does not resolve'),
  ('b7e9f33d-5e14-499a-9287-a1ac3e652f0b'::uuid, 'dns_error: domain does not resolve'),
  ('2c89da3e-60f2-4cb0-bf6e-c8675dbcb46a'::uuid, 'dns_error: domain does not resolve'),
  ('3b187b20-bd6a-414d-bba5-082d1d25b196'::uuid, 'dns_error: domain does not resolve'),
  ('a9e92595-e219-456d-98b5-53e4f6a592ac'::uuid, 'dns_error: domain does not resolve'),
  ('60ac7ab7-02bd-4d52-a95e-92720c4ca16a'::uuid, 'dns_error: domain does not resolve'),
  ('ee33f9de-661e-447e-b212-019cd1408c18'::uuid, 'dns_error: domain does not resolve'),
  ('e30423f8-8d3a-481b-b55c-17afa9f354eb'::uuid, 'dns_error: domain does not resolve'),
  -- 0.3 outside Kenya (decision D4: Kenya only)
  ('df906b7c-84b6-4c1f-a892-22aaecee5127'::uuid, 'off_scope: outside Kenya'),
  ('7df5cd2a-51bf-4b92-98c8-3a6981e733de'::uuid, 'off_scope: outside Kenya'),
  ('b8b63aaf-4cd8-4de1-90d5-1b618401c595'::uuid, 'off_scope: outside Kenya'),
  ('4c22c139-30ef-421c-9b69-67a3e6299255'::uuid, 'off_scope: outside Kenya'),
  ('4d13e44c-c435-4885-8c85-58312e5b5053'::uuid, 'off_scope: outside Kenya'),
  ('9efb8f75-f3e3-4d94-9477-2d2ba6e04313'::uuid, 'off_scope: outside Kenya'),
  ('ad2d95eb-b65e-46f9-a3b6-f88fa7dd77c3'::uuid, 'off_scope: outside Kenya'),
  ('2ad20dd7-52ca-4aa5-b1d0-a96dddfeb773'::uuid, 'off_scope: outside Kenya'),
  ('664ff95f-38a5-416e-a1de-13cba69b4005'::uuid, 'off_scope: outside Kenya'),
  ('30d7e2b3-b1c1-4f85-9a91-c83c59b84a65'::uuid, 'off_scope: outside Kenya'),
  ('0da1e39f-bb1c-4a12-971c-66f3e1dd3ed0'::uuid, 'off_scope: outside Kenya'),
  ('6593d333-3e06-43be-8c7a-22263be1fb03'::uuid, 'off_scope: outside Kenya'),
  ('38e23e8e-82c8-4512-8160-b60a0463fe8e'::uuid, 'off_scope: outside Kenya'),
  ('d42264b7-5277-4c80-bce6-bc4c1605df65'::uuid, 'off_scope: outside Kenya'),
  -- 0.4 duplicates and off-host redirects
  ('8aad4114-244a-4f17-a06f-1d88c7e9f647'::uuid, 'duplicate: BORAQS is collected from boraqs.go.ke'),
  ('26daaa01-0573-4291-825f-cdd2452ad1ff'::uuid, 'duplicate: People Daily is collected from peopledaily.digital'),
  ('2f4fbf26-5f96-499c-8161-2a63a4d51afd'::uuid, 'redirects to global knightfrank.com; revisit with a Kenya URL in Phase 5')
), deactivated as (
  update news_sources s
     set active = false, updated_at = now()
    from changes c
   where s.id = c.id and s.active
  returning s.id, c.reason
)
insert into news_events(source_id, event_type, payload)
select id, 'source_deactivated', jsonb_build_object('reason', reason, 'change', 'phase0-2026-11-02')
  from deactivated;

-- People Daily: pd.co.ke redirects to peopledaily.digital; allow both hosts.
with updated as (
  update news_sources
     set parser_config = jsonb_set(parser_config, '{allowed_hosts}',
                                   '["peopledaily.digital", "www.peopledaily.digital", "pd.co.ke", "www.pd.co.ke"]'::jsonb),
         updated_at = now()
   where id = '00196009-88a3-4b4a-a474-74567ef06448'
     and parser_config->'allowed_hosts' is distinct from
         '["peopledaily.digital", "www.peopledaily.digital", "pd.co.ke", "www.pd.co.ke"]'::jsonb
  returning id
)
insert into news_events(source_id, event_type, payload)
select id, 'source_config_updated',
       jsonb_build_object('change', 'phase0-2026-11-02', 'allowed_hosts_added', jsonb_build_array('pd.co.ke', 'www.pd.co.ke'))
  from updated;

select count(*) as active_web_sources_after from news_sources where active and platform = 'web';
