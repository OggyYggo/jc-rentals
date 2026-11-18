create type public.contact_topic as enum ('booking', 'cars_pricing', 'payment', 'owner', 'other');
create type public.contact_status as enum ('new', 'in_progress', 'resolved', 'spam');

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null check (char_length(email) between 3 and 120),
  mobile text check (mobile is null or mobile ~ '^\+639[0-9]{9}$'),
  topic public.contact_topic not null,
  booking_ref text check (booking_ref is null or booking_ref ~ '^[A-Za-z0-9-]{1,40}$'),
  message text not null check (char_length(message) between 10 and 1000),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  status public.contact_status not null default 'new',
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'partial', 'failed')),
  admin_note text,
  resolved_at timestamptz
);

alter table public.contact_messages enable row level security;
revoke all on table public.contact_messages from public, anon, authenticated;
grant select, update (status, admin_note, resolved_at) on table public.contact_messages to authenticated;
grant all on table public.contact_messages to service_role;

create policy "Admins read contact messages" on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy "Admins update contact messages" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);

create table public.contact_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.contact_rate_limit_events enable row level security;
revoke all on table public.contact_rate_limit_events from public, anon, authenticated;
grant all on table public.contact_rate_limit_events to service_role;
create index contact_rate_limit_ip_created_idx on public.contact_rate_limit_events (ip_hash, created_at desc);
create index contact_rate_limit_email_created_idx on public.contact_rate_limit_events (email_hash, created_at desc);

create or replace function public.consume_contact_rate_limit(p_ip_hash text, p_email_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ip_hour_count bigint;
  ip_day_count bigint;
  email_hour_count bigint;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_ip_hash), 101);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_email_hash), 102);

  select count(*) into ip_hour_count
  from public.contact_rate_limit_events
  where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';

  select count(*) into ip_day_count
  from public.contact_rate_limit_events
  where ip_hash = p_ip_hash and created_at > now() - interval '1 day';

  select count(*) into email_hour_count
  from public.contact_rate_limit_events
  where email_hash = p_email_hash and created_at > now() - interval '1 hour';

  if ip_hour_count >= 5 or ip_day_count >= 20 or email_hour_count >= 3 then
    return false;
  end if;

  insert into public.contact_rate_limit_events (ip_hash, email_hash)
  values (p_ip_hash, p_email_hash);

  -- Keep only a small rolling history for the limiter; hashes cannot be reversed to IPs or emails.
  delete from public.contact_rate_limit_events where created_at <= now() - interval '1 day';
  return true;
end;
$$;

revoke all on function public.consume_contact_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_contact_rate_limit(text, text) to service_role;

-- Contact messages may be retained for up to 12 months, then deleted according to the privacy policy.
