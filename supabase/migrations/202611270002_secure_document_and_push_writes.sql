-- Customer documents are write-once for browser roles. The upload route records
-- consent, processes the file and changes the profile pointer through service_role.
drop policy if exists "Customers can upload own documents" on storage.objects;
drop policy if exists "Customers can replace own documents" on storage.objects;
drop policy if exists "Customers can delete own documents" on storage.objects;
revoke update (license_path, id_path) on public.profiles from public, anon, authenticated;

drop policy if exists "own subs insert" on public.push_subscriptions;
drop policy if exists "own subs delete" on public.push_subscriptions;
revoke insert, update, delete on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
