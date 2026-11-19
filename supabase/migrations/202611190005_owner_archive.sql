-- Bind archive authority to the verified account's UUID, outside the client API.
create schema if not exists private;
create table private.owner_archive_admin (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);
revoke all on private.owner_archive_admin from public, anon, authenticated;

create function private.provision_owner_archive_admin()
returns boolean
language plpgsql set search_path = ''
as $$
begin
  insert into private.owner_archive_admin (user_id)
  select u.id
  from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = 'jc-admi@rentals.com' and u.email_confirmed_at is not null
  on conflict (singleton) do nothing;

  update public.profiles p set role = 'admin'
  from private.owner_archive_admin a join auth.users u on u.id = a.user_id
  where p.id = a.user_id and lower(u.email) = 'jc-admi@rentals.com' and u.email_confirmed_at is not null;
  return found;
end;
$$;
revoke all on function private.provision_owner_archive_admin() from public, anon, authenticated;

do $$
begin
  if not private.provision_owner_archive_admin() then
    raise warning 'Verify the designated super admin account, then run private.provision_owner_archive_admin() from the SQL Editor.';
  end if;
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
      and lower(u.email) = 'jc-admi@rentals.com' and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_super_admin() from public, anon, authenticated;
grant execute on function public.is_super_admin() to authenticated;

alter table public.owners
  add column archived_at timestamptz,
  add column archived_by uuid,
  add column active_before_archive boolean,
  add constraint owners_archive_state_check check (
    (archived_at is null and archived_by is null and active_before_archive is null)
    or (archived_at is not null and archived_by is not null and active_before_archive is not null and is_active is false)
  );

-- Existing public visibility and booking checks already require an active owner.
drop policy if exists "Owners can read own business" on public.owners;
create policy "Owners can read own business" on public.owners
  for select to authenticated using (profile_id = (select auth.uid()) and archived_at is null);

drop policy if exists "Owners can update own payment settings" on public.owners;
create policy "Owners can update own payment settings" on public.owners
  for update to authenticated
  using (profile_id = (select auth.uid()) and archived_at is null)
  with check (profile_id = (select auth.uid()) and archived_at is null);

create or replace function public.set_owner_archived(p_owner_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  owner_row public.owners%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Super administrator access required.' using errcode = '42501';
  end if;
  if p_archived is null then raise exception 'Choose whether to archive or restore the owner.'; end if;

  select * into owner_row from public.owners where id = p_owner_id for update;
  if not found then raise exception 'Owner not found.'; end if;

  if p_archived and owner_row.archived_at is null then
    update public.owners
    set archived_at = now(), archived_by = auth.uid(), active_before_archive = is_active, is_active = false
    where id = p_owner_id;
  elsif not p_archived and owner_row.archived_at is not null then
    update public.owners
    set is_active = active_before_archive, archived_at = null, archived_by = null, active_before_archive = null
    where id = p_owner_id;
  end if;
end;
$$;
revoke all on function public.set_owner_archived(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_owner_archived(uuid, boolean) to authenticated;

create or replace function public.admin_set_owner_active(p_owner_id uuid, p_is_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  update public.owners set is_active = p_is_active where id = p_owner_id and archived_at is null;
  if not found then raise exception 'This owner is archived or unavailable.'; end if;
end;
$$;
revoke all on function public.admin_set_owner_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_owner_active(uuid, boolean) to authenticated;
