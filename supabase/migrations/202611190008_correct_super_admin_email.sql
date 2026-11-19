-- Switch archive authority to the verified jc-admin account.
create or replace function private.provision_owner_archive_admin()
returns boolean
language plpgsql set search_path = ''
as $$
declare
  target_id uuid;
begin
  select u.id into target_id
  from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = 'jc-admin@rentals.com' and u.email_confirmed_at is not null;
  if not found then return false; end if;

  update public.profiles set role = 'admin' where id = target_id and role <> 'admin';
  insert into private.owner_archive_admin (user_id)
  values (target_id)
  on conflict (singleton) do update set user_id = excluded.user_id;
  return true;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() and exists (
    select 1 from private.owner_archive_admin a
    join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and lower(u.email) = 'jc-admin@rentals.com' and u.email_confirmed_at is not null
  );
$$;

do $$
begin
  if not private.provision_owner_archive_admin() then
    raise warning 'Verify jc-admin@rentals.com, then run private.provision_owner_archive_admin() from the SQL Editor.';
  end if;
end;
$$;
