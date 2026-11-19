alter table public.profiles
  add column customer_archived_at timestamptz,
  add column customer_archived_by uuid,
  add constraint profiles_customer_archive_state_check check (
    (customer_archived_at is null and customer_archived_by is null)
    or (customer_archived_at is not null and customer_archived_by is not null and role = 'customer')
  );

-- Existing profile RLS still determines which rows each account can read.
grant select (customer_archived_at) on public.profiles to authenticated;

create or replace function public.set_customer_archived(p_customer_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  archived_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Super administrator access required.' using errcode = '42501';
  end if;
  if p_archived is null then raise exception 'Choose whether to archive or restore the customer.'; end if;

  select p.customer_archived_at into archived_at
  from public.profiles p where p.id = p_customer_id and p.role = 'customer' for update;
  if not found then raise exception 'Customer profile not found.'; end if;

  if p_archived and archived_at is null then
    update public.profiles set customer_archived_at = now(), customer_archived_by = auth.uid()
    where id = p_customer_id;
  elsif not p_archived and archived_at is not null then
    update public.profiles set customer_archived_at = null, customer_archived_by = null
    where id = p_customer_id;
  end if;
end;
$$;
revoke all on function public.set_customer_archived(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_customer_archived(uuid, boolean) to authenticated;

-- Serialize new booking requests with archive/restore. Existing bookings are untouched.
create or replace function public.block_archived_customer_booking()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  archived_at timestamptz;
begin
  select p.customer_archived_at into archived_at
  from public.profiles p where p.id = new.customer_id for share;
  if archived_at is not null then raise exception 'CUSTOMER_ARCHIVED'; end if;
  return new;
end;
$$;
revoke all on function public.block_archived_customer_booking() from public, anon, authenticated;

create trigger block_archived_customer_booking
before insert on public.bookings
for each row execute function public.block_archived_customer_booking();
