create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('super_admin', 'support', 'read_only')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  invited_by uuid references public.admins(id) on delete set null,
  invite_token_hash text,
  invite_expires_at timestamptz,
  password_set_at timestamptz
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_admin_id uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  admin_id uuid not null references public.admins(id) on delete restrict,
  message text not null,
  sent_at timestamptz not null default now()
);

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.admins(id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists support_tickets_status_priority_idx
  on public.support_tickets(status, priority, updated_at desc);
create index if not exists support_ticket_replies_ticket_idx
  on public.support_ticket_replies(ticket_id, sent_at);
create index if not exists listing_reports_status_idx
  on public.listing_reports(status, created_at desc);

create or replace function public.varoom_set_support_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_tickets_updated_at on public.support_tickets;
create trigger support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.varoom_set_support_ticket_updated_at();
