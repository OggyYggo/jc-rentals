-- Expand the existing guest application flow without removing previously
-- submitted application data.
alter table public.owner_applications
  add column if not exists address text,
  add column if not exists plate_number text,
  add column if not exists seats integer,
  add column if not exists transmission text,
  add column if not exists fuel_type text,
  add column if not exists offers_self_drive boolean not null default true,
  add column if not exists offers_with_driver boolean not null default false,
  add column if not exists daily_rate_self_drive numeric(10,2),
  add column if not exists daily_rate_with_driver numeric(10,2),
  add column if not exists pickup_location text,
  add column if not exists car_photo_paths text[] not null default '{}',
  add column if not exists orcr_path text,
  add column if not exists license_path text,
  add column if not exists id_path text,
  add column if not exists payment_qr_path text,
  add column if not exists admin_note text,
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists edit_token_hash text,
  add column if not exists edit_token_expires_at timestamptz,
  add column if not exists submitted_ip inet,
  add column if not exists updated_at timestamptz not null default now();

alter table public.owner_applications drop constraint if exists owner_applications_status_check;
alter table public.owner_applications add constraint owner_applications_status_check
  check (status in ('pending','needs_changes','approved','rejected','withdrawn'));

create index if not exists owner_applications_status_created_idx
  on public.owner_applications(status, created_at desc);
create unique index if not exists owner_applications_one_open_per_email
  on public.owner_applications(lower(email)) where status in ('pending','needs_changes');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('owner-applications', 'owner-applications', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880;

-- Only service_role can access these private application files.
drop policy if exists "owner application files service access" on storage.objects;
create policy "owner application files service access" on storage.objects
  for all to service_role using (bucket_id = 'owner-applications')
  with check (bucket_id = 'owner-applications');
