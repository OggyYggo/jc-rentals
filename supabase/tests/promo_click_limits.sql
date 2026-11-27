begin;
insert into auth.users(id,email) values ('a2700000-0000-4000-8000-000000000001','promo-limit@example.invalid');
update public.profiles set role = 'owner' where id = 'a2700000-0000-4000-8000-000000000001';
insert into public.owners(id,profile_id,business_name)
values ('b2700000-0000-4000-8000-000000000001','a2700000-0000-4000-8000-000000000001','Promo fixture');
select set_config('request.jwt.claim.sub','a2700000-0000-4000-8000-000000000001',true);
insert into public.cars(id,owner_id,brand,model,is_active)
values ('c2700000-0000-4000-8000-000000000001','b2700000-0000-4000-8000-000000000001','Fixture','Car',true);
set local role authenticated;
do $$ begin
  assert not has_function_privilege('public.record_promo_click_limited(uuid,text,text)','execute');
end $$;
set local role service_role;
do $$
declare
  car constant uuid := 'c2700000-0000-4000-8000-000000000001';
begin
  for i in 1..25 loop
    perform public.record_promo_click_limited(car, 'share', repeat('a',64));
  end loop;
  assert (select count(*) from public.promo_clicks where car_id = car) = 20;
  for caller in 1..6 loop
    for i in 1..20 loop
      perform public.record_promo_click_limited(car, 'post', lpad(to_hex(caller),64,'0'));
    end loop;
  end loop;
  assert (select count(*) from public.promo_clicks where car_id = car) = 120;
end $$;
rollback;
