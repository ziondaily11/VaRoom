-- Notifications: a person can delete their own notifications (the Notifications
-- page: right-click → Delete, or select several and delete them together).
--
-- Until now the table had select, update and insert policies but none for
-- delete, so a delete from the app removed nothing. This adds one, limited to
-- the recipient's own rows. Nothing else reads past notifications: team
-- invitations live in host_team_members, and a deleted notification's
-- event_key is free again, so a later event of the same kind notifies anew.
--
-- Check before running (read only; lists the current policies, none is for delete):
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'notifications' order by 1;

drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_delete_own
  on public.notifications for delete
  using (recipient_user_id = auth.uid());

-- Undo:
-- drop policy if exists notifications_delete_own on public.notifications;
