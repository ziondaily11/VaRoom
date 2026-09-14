create table if not exists public.chat_user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.admins(id) on delete set null,
  reviewed_at timestamptz,
  check (reporter_user_id <> reported_user_id)
);

create index if not exists chat_user_reports_status_idx
  on public.chat_user_reports(status, created_at desc);

alter table public.chat_user_reports enable row level security;

drop policy if exists chat_user_reports_insert on public.chat_user_reports;
create policy chat_user_reports_insert
  on public.chat_user_reports for insert to authenticated
  with check (
    reporter_user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          (c.host_id = auth.uid() and c.client_id = reported_user_id)
          or (c.client_id = auth.uid() and c.host_id = reported_user_id)
        )
    )
  );
