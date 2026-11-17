-- Extend existing guest applications with private document storage fields.
alter table public.owner_applications
  add column if not exists notes text,
  add column if not exists car_photo_paths text[] not null default '{}',
  add column if not exists orcr_path text,
  add column if not exists license_path text,
  add column if not exists id_path text,
  add column if not exists payment_qr_path text,
  add column if not exists updated_at timestamptz not null default now();

-- The earlier public JSON endpoint is retired in favor of the validated server action.
revoke insert on public.owner_applications from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('owner-applications', 'owner-applications', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner application files service access" on storage.objects;
create policy "owner application files service access" on storage.objects
  for all to service_role using (bucket_id = 'owner-applications')
  with check (bucket_id = 'owner-applications');
grant execute on function public.notify_admins(text,text,text,text,text[],boolean,text) to service_role;

-- The existing database-backed limiter is shared with the former route.
create or replace function public.consume_owner_application_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_count integer;
begin
  insert into public.owner_application_rate_limits (ip_hash, window_started_at, submission_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update set
    window_started_at = case when public.owner_application_rate_limits.window_started_at <= now() - interval '1 hour' then now() else public.owner_application_rate_limits.window_started_at end,
    submission_count = case when public.owner_application_rate_limits.window_started_at <= now() - interval '1 hour' then 1 else public.owner_application_rate_limits.submission_count + 1 end
  returning submission_count into current_count;
  return current_count <= 3;
end;
$$;
revoke all on function public.consume_owner_application_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_owner_application_rate_limit(text) to service_role;
