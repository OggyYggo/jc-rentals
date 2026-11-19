do $$ begin
  create type public.vehicle_type as enum ('car', 'motorcycle');
exception when duplicate_object then null; end $$;

alter table public.cars
  add column if not exists vehicle_type public.vehicle_type not null default 'car',
  add column if not exists engine_cc int,
  add column if not exists helmets_included int not null default 0;
alter table public.cars drop constraint if exists cars_engine_cc_check;
alter table public.cars add constraint cars_engine_cc_check check (engine_cc is null or engine_cc between 50 and 2000);
alter table public.cars drop constraint if exists cars_helmets_included_check;
alter table public.cars add constraint cars_helmets_included_check check (helmets_included between 0 and 2);
alter table public.cars drop constraint if exists cars_motorcycle_rules;
alter table public.cars add constraint cars_motorcycle_rules check (
  vehicle_type = 'car' or (seats is not null and seats between 1 and 2 and allows_with_driver = false and allows_self_drive = true)
);
alter table public.cars drop constraint if exists cars_engine_cc_type_check;
alter table public.cars add constraint cars_engine_cc_type_check check (vehicle_type = 'motorcycle' or engine_cc is null);
alter table public.cars drop constraint if exists cars_car_helmets_check;
alter table public.cars add constraint cars_car_helmets_check check (vehicle_type = 'motorcycle' or helmets_included = 0);
alter table public.cars drop constraint if exists cars_transmission_values_check;
alter table public.cars add constraint cars_transmission_values_check check (transmission is null or lower(transmission) in ('automatic','manual','semi-automatic'));
alter table public.cars drop constraint if exists cars_motorcycle_fuel_check;
alter table public.cars add constraint cars_motorcycle_fuel_check check (vehicle_type = 'car' or (fuel_type is not null and lower(fuel_type) in ('gasoline','electric')));
alter table public.cars drop constraint if exists cars_motorcycle_type_check;
alter table public.cars add constraint cars_motorcycle_type_check check (vehicle_type = 'car' or (car_type is not null and car_type in ('Scooter','Standard','Adventure','Big bike')));
create index if not exists cars_vehicle_type_idx on public.cars(vehicle_type) where is_active;

alter table public.owner_applications
  add column if not exists vehicle_type public.vehicle_type not null default 'car',
  add column if not exists engine_cc int,
  add column if not exists helmets_included int not null default 0,
  add column if not exists car_type text;
alter table public.owner_applications drop constraint if exists owner_applications_motorcycle_rules;
alter table public.owner_applications add constraint owner_applications_motorcycle_rules check (
  engine_cc is null or engine_cc between 50 and 2000
);
alter table public.owner_applications drop constraint if exists owner_applications_helmets_included_check;
alter table public.owner_applications add constraint owner_applications_helmets_included_check check (helmets_included between 0 and 2);
alter table public.owner_applications drop constraint if exists owner_applications_vehicle_rules;
alter table public.owner_applications add constraint owner_applications_vehicle_rules check (
  vehicle_type = 'car' or (seats is not null and seats between 1 and 2 and offers_with_driver = false and offers_self_drive = true)
);
alter table public.owner_applications drop constraint if exists owner_applications_engine_cc_type_check;
alter table public.owner_applications add constraint owner_applications_engine_cc_type_check check (vehicle_type = 'motorcycle' or engine_cc is null);
alter table public.owner_applications drop constraint if exists owner_applications_car_helmets_check;
alter table public.owner_applications add constraint owner_applications_car_helmets_check check (vehicle_type = 'motorcycle' or helmets_included = 0);
alter table public.owner_applications drop constraint if exists owner_applications_motorcycle_fuel_check;
alter table public.owner_applications add constraint owner_applications_motorcycle_fuel_check check (vehicle_type = 'car' or (fuel_type is not null and lower(fuel_type) in ('gasoline','electric')));
alter table public.owner_applications drop constraint if exists owner_applications_motorcycle_type_check;
alter table public.owner_applications add constraint owner_applications_motorcycle_type_check check (vehicle_type = 'car' or (car_type is not null and car_type in ('Scooter','Standard','Adventure','Big bike')));

create or replace function public.prevent_vehicle_type_change_after_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_type is distinct from old.vehicle_type and exists (select 1 from public.bookings b where b.car_id = old.id) then
    raise exception 'VEHICLE_TYPE_LOCKED_AFTER_BOOKING';
  end if;
  return new;
end $$;
revoke all on function public.prevent_vehicle_type_change_after_booking() from public, anon, authenticated;
drop trigger if exists prevent_vehicle_type_change_after_booking on public.cars;
create trigger prevent_vehicle_type_change_after_booking before update of vehicle_type on public.cars for each row execute function public.prevent_vehicle_type_change_after_booking();

-- Preserve the existing plans API while exposing vehicle terminology to new code.
alter table public.plans add column if not exists max_active_vehicles int;
update public.plans set max_active_vehicles = max_active_cars where max_active_vehicles is null;
alter table public.plans alter column max_active_vehicles set not null;
alter table public.plans drop constraint if exists plans_max_active_vehicles_check;
alter table public.plans add constraint plans_max_active_vehicles_check check (max_active_vehicles between 1 and 1000);
update public.plans set features = replace(features::text, 'cars', 'vehicles')::jsonb;
alter table public.owner_plans add column if not exists vehicle_limit_override int;
update public.owner_plans set vehicle_limit_override = car_limit_override where vehicle_limit_override is null;
alter table public.owner_plans drop constraint if exists owner_plans_vehicle_limit_override_check;
alter table public.owner_plans add constraint owner_plans_vehicle_limit_override_check check (vehicle_limit_override is null or vehicle_limit_override between 1 and 1000);

alter table public.profiles
  add column if not exists license_declared_classes text[] not null default '{}',
  add column if not exists license_classes text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_license_declared_classes_check;
alter table public.profiles add constraint profiles_license_declared_classes_check check (license_declared_classes <@ array['car','motorcycle']::text[]);
alter table public.profiles drop constraint if exists profiles_license_classes_check;
alter table public.profiles add constraint profiles_license_classes_check check (license_classes <@ array['car','motorcycle']::text[]);
update public.profiles set license_classes = array['car'] where verification = 'approved' and cardinality(license_classes) = 0;
grant update (license_declared_classes) on public.profiles to authenticated;

-- A changed license invalidates the prior admin confirmation as well as review status.
create or replace function public.mark_customer_documents_pending()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.license_path is distinct from old.license_path then
    new.license_classes := '{}';
    new.verification := 'pending';
  end if;
  if (new.license_path is distinct from old.license_path or new.id_path is distinct from old.id_path)
     and old.verification <> 'approved' then
    new.verification := 'pending';
  end if;
  return new;
end;
$$;

create or replace function public.sync_vehicle_plan_limits()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.max_active_vehicles := coalesce(new.max_active_vehicles, new.max_active_cars);
    new.max_active_cars := new.max_active_vehicles;
  elsif new.max_active_cars is distinct from old.max_active_cars and new.max_active_vehicles is not distinct from old.max_active_vehicles then
    new.max_active_vehicles := new.max_active_cars;
  elsif new.max_active_vehicles is distinct from old.max_active_vehicles then
    new.max_active_cars := new.max_active_vehicles;
  end if;
  return new;
end $$;
drop trigger if exists sync_vehicle_plan_limits on public.plans;
create trigger sync_vehicle_plan_limits before insert or update of max_active_cars,max_active_vehicles on public.plans for each row execute function public.sync_vehicle_plan_limits();

create or replace function public.sync_owner_vehicle_limit_override()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.vehicle_limit_override := coalesce(new.vehicle_limit_override, new.car_limit_override);
    new.car_limit_override := new.vehicle_limit_override;
  elsif new.car_limit_override is distinct from old.car_limit_override and new.vehicle_limit_override is not distinct from old.vehicle_limit_override then
    new.vehicle_limit_override := new.car_limit_override;
  elsif new.vehicle_limit_override is distinct from old.vehicle_limit_override then
    new.car_limit_override := new.vehicle_limit_override;
  end if;
  return new;
end $$;
drop trigger if exists sync_owner_vehicle_limit_override on public.owner_plans;
create trigger sync_owner_vehicle_limit_override before insert or update of car_limit_override,vehicle_limit_override on public.owner_plans for each row execute function public.sync_owner_vehicle_limit_override();

create or replace function public.admin_set_customer_license_classes(p_customer uuid, p_classes text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_classes is null or not (p_classes <@ array['car','motorcycle']::text[]) then raise exception 'Invalid license classes.'; end if;
  update public.profiles set license_classes = p_classes where id = p_customer and role = 'customer';
  if not found then raise exception 'Customer not found.'; end if;
end $$;
revoke all on function public.admin_set_customer_license_classes(uuid,text[]) from public, anon;
grant execute on function public.admin_set_customer_license_classes(uuid,text[]) to authenticated;

create or replace function public.enforce_license_class_for_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type public.vehicle_type;
begin
  if new.mode <> 'self_drive' then return new; end if;
  select c.vehicle_type into v_type from public.cars c where c.id = new.car_id;
  if v_type is null then raise exception 'VEHICLE_NOT_FOUND'; end if;
  if not exists (select 1 from public.profiles p where p.id = new.customer_id and v_type::text = any(p.license_classes)) then
    raise exception 'LICENSE_CLASS_REQUIRED' using errcode = '23514', detail = v_type::text;
  end if;
  return new;
end $$;
revoke all on function public.enforce_license_class_for_booking() from public, anon, authenticated;
drop trigger if exists enforce_license_class_for_booking on public.bookings;
create trigger enforce_license_class_for_booking before insert on public.bookings for each row execute function public.enforce_license_class_for_booking();

create or replace function public.notify_profile_license_classes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.license_classes is distinct from old.license_classes then
    perform public.notify(new.id, 'license_classes_updated', 'License details confirmed', 'Your verified license classes were updated. You can now book vehicles covered by your license.', '/account/documents', null, '{in_app,email}', false, 'license-classes:' || new.id || ':' || md5(new.license_classes::text));
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_profile_license_classes on public.profiles;
create trigger trg_notify_profile_license_classes after update of license_classes on public.profiles for each row execute function public.notify_profile_license_classes();
revoke all on function public.notify_profile_license_classes() from public, anon, authenticated;
revoke all on function public.sync_vehicle_plan_limits() from public, anon, authenticated;
revoke all on function public.sync_owner_vehicle_limit_override() from public, anon, authenticated;
