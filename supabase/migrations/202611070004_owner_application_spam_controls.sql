-- Public applications must pass through the server so the honeypot and
-- database-backed rate limit cannot be bypassed with direct table inserts.
revoke insert on public.owner_applications from anon, authenticated;

create table if not exists public.owner_application_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  submission_count integer not null default 0 check (submission_count >= 0)
);

alter table public.owner_application_rate_limits enable row level security;
revoke all on public.owner_application_rate_limits from public, anon, authenticated;
grant all on public.owner_application_rate_limits to service_role;

create or replace function public.consume_owner_application_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  insert into public.owner_application_rate_limits (ip_hash, window_started_at, submission_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update set
    window_started_at = case
      when public.owner_application_rate_limits.window_started_at <= now() - interval '1 hour' then now()
      else public.owner_application_rate_limits.window_started_at
    end,
    submission_count = case
      when public.owner_application_rate_limits.window_started_at <= now() - interval '1 hour' then 1
      else public.owner_application_rate_limits.submission_count + 1
    end
  returning submission_count into current_count;

  return current_count <= 5;
end;
$$;

revoke all on function public.consume_owner_application_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_owner_application_rate_limit(text) to service_role;
