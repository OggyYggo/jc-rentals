-- Keep profile row access governed by the existing RLS policies.
grant select (license_declared_classes, license_classes) on public.profiles to authenticated;
