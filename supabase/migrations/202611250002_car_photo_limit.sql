create or replace function public.enforce_car_photo_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  max_photos constant integer := 3;
begin
  if tg_op = 'UPDATE' then
    if new.car_id is not distinct from old.car_id then return new; end if;
  end if;
  perform 1 from public.cars where id = new.car_id for update;
  if (select count(*) from public.car_photos where car_id = new.car_id) >= max_photos then
    raise exception 'CAR_PHOTO_LIMIT';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_car_photo_limit() from public, anon, authenticated;
drop trigger if exists enforce_car_photo_limit on public.car_photos;
create trigger enforce_car_photo_limit before insert or update of car_id on public.car_photos
for each row execute function public.enforce_car_photo_limit();
