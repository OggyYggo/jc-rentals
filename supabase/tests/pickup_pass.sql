-- Run after all migrations in a disposable database. Every fixture rolls back.
begin;

create function pg_temp.person(n int) returns uuid language sql immutable as $$
  select ('aa100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.owner_id(n int) returns uuid language sql immutable as $$
  select ('aa200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.car_id(n int) returns uuid language sql immutable as $$
  select ('aa300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.booking_id(n int) returns uuid language sql immutable as $$
  select ('aa400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.claim(n int) returns text language sql as $$
  select set_config('request.jwt.claims',case when n is null then '{}' else
    jsonb_build_object('sub',pg_temp.person(n),'role','authenticated')::text end,true)
$$;
create function pg_temp.object_path(n int, attempt int default 1) returns text language sql immutable as $$
  select pg_temp.person(1)||'/'||pg_temp.booking_id(n)||'/proof-'||attempt||'.webp'
$$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected error: %', expected;
exception when others then
  assert position(expected in sqlerrm) > 0 and sqlerrm <> 'Expected error: '||expected, sqlerrm;
end
$$;
create function pg_temp.create_booking(n int, car int) returns void language sql as $$
  insert into public.bookings (id,car_id,customer_id,mode,start_date,end_date)
  values(pg_temp.booking_id(n),pg_temp.car_id(car),pg_temp.person(1),'self_drive',current_date+n*3,current_date+n*3+1)
$$;

insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.person(n),'qr-test-'||n||'@example.invalid',jsonb_build_object('full_name','Payment fixture '||n)
from generate_series(1,5) n;
update public.profiles set verification='approved',license_classes=array['car'] where id=pg_temp.person(1);
update public.profiles set role='owner' where id in (pg_temp.person(2),pg_temp.person(3));
update public.profiles set role='admin' where id=pg_temp.person(4);
insert into public.owners(id,profile_id,business_name,contact_phone,payment_qr_verified,fee_mode,commission_rate)
values (pg_temp.owner_id(1),pg_temp.person(2),'QR One','09000000001',true,'invoice',0.05),
       (pg_temp.owner_id(2),pg_temp.person(3),'QR Two','09000000002',true,'invoice',0.05);
select pg_temp.claim(4);
insert into public.cars(id,owner_id,brand,model)
select pg_temp.car_id(n),pg_temp.owner_id(n),'Fixture','Car '||n from generate_series(1,2) n;
select pg_temp.claim(null);
insert into public.car_rates(car_id,mode,daily_rate,deposit_amount)
select pg_temp.car_id(n),'self_drive',12000,500 from generate_series(1,2) n;
select pg_temp.create_booking(1,1);
select pg_temp.create_booking(2,1);
select pg_temp.create_booking(3,2);
select pg_temp.create_booking(4,1);
select pg_temp.create_booking(5,1);
select pg_temp.create_booking(6,1);
select pg_temp.create_booking(9,1);

insert into storage.objects(bucket_id,name)
select 'payment-proofs',pg_temp.object_path(n,a) from generate_series(1,9) n cross join generate_series(1,4) a;
insert into storage.objects(bucket_id,name)
values ('refund-proofs', pg_temp.person(2)||'/'||pg_temp.booking_id(1)||'/refund.webp');

create temp table credentials (kind text primary key, token text, code text);
grant select, insert on credentials to authenticated;

set local role authenticated;
select pg_temp.claim(1);
do $$ begin
  assert public.get_my_pickup_pass(pg_temp.booking_id(1))->>'state' = 'not_ready';
  assert not (public.get_my_pickup_pass(pg_temp.booking_id(1)) ? 'token');
end $$;
select public.submit_booking_payment(pg_temp.booking_id(1),'PICKUP-123456',pg_temp.object_path(1));
do $$ begin
  assert public.get_my_pickup_pass(pg_temp.booking_id(1))->>'state' = 'not_ready';
end $$;
select pg_temp.claim(2);
select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)),3600,'PICKUP-123456');

reset role;
select pg_temp.claim(null);
select public.ensure_pickup_pass(pg_temp.booking_id(1));
do $$ begin
  assert (select count(*) = 1 from public.booking_pickup_passes where booking_id=pg_temp.booking_id(1));
  assert (select count(*) = 1 from public.notifications where booking_id=pg_temp.booking_id(1) and type='pickup_pass_ready');
  assert not has_function_privilege('anon','public.owner_lookup_pickup_pass(text,text)','execute');
  assert not has_column_privilege('authenticated','public.booking_pickup_passes','token','select');
end $$;
update public.bookings set start_date=(now() at time zone 'Asia/Manila')::date,
  end_date=(now() at time zone 'Asia/Manila')::date+1 where id=pg_temp.booking_id(1);
select public.send_pickup_reminders();
select public.send_pickup_reminders();
do $$ begin
  assert (select count(*) = 1 from public.notifications where booking_id=pg_temp.booking_id(1) and type='pickup_today');
end $$;

set local role authenticated;
select pg_temp.claim(5);
do $$ begin
  assert public.get_my_pickup_pass(pg_temp.booking_id(1)) is null;
  assert public.owner_lookup_pickup_pass(repeat('a',64)) = '{"result":"NOT_VALID"}'::jsonb;
end $$;
select pg_temp.claim(1);
insert into credentials select 'old',p->>'token',p->>'backup_code' from public.get_my_pickup_pass(pg_temp.booking_id(1)) p;
select public.rotate_my_pickup_pass(pg_temp.booking_id(1));
select public.rotate_my_pickup_pass(pg_temp.booking_id(1));
select public.rotate_my_pickup_pass(pg_temp.booking_id(1));
select pg_temp.expect_error($$select public.rotate_my_pickup_pass(pg_temp.booking_id(1))$$,'ROTATION_LIMIT');
insert into credentials select 'current',p->>'token',p->>'backup_code' from public.get_my_pickup_pass(pg_temp.booking_id(1)) p;

select pg_temp.claim(3);
do $$
declare current_token text := (select token from credentials where kind='current');
begin
  assert public.owner_lookup_pickup_pass(current_token) = '{"result":"NOT_VALID"}'::jsonb;
  for attempt in 1..4 loop
    assert public.owner_lookup_pickup_pass(repeat('a',64)) = '{"result":"NOT_VALID"}'::jsonb;
  end loop;
  assert public.owner_lookup_pickup_pass(p_code=>'123456')->>'result' = 'LOCKED';
end $$;

select pg_temp.claim(2);
do $$ begin
  assert public.owner_lookup_pickup_pass((select token from credentials where kind='old'))->>'result' = 'NOT_VALID';
  assert public.owner_lookup_pickup_pass((select token from credentials where kind='current'))->>'result' = 'OK';
  assert public.owner_lookup_pickup_pass(p_code=>(select code from credentials where kind='current'))->>'result' = 'OK';
end $$;
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.booking_id(1), (select token from credentials where kind='old'), true, true, 'cash')$$,'PASS_NOT_VALID');
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.booking_id(1), (select token from credentials where kind='current'), false, true, 'cash')$$,'ID_CHECK_REQUIRED');
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.booking_id(1), (select token from credentials where kind='current'), true, true, 'bad')$$,'BALANCE_REQUIRED');
select public.owner_confirm_pickup(pg_temp.booking_id(1),null,true,true,'cash',null,(select code from credentials where kind='current'));
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.booking_id(1), (select token from credentials where kind='current'), true, true, 'cash')$$,'ALREADY_USED');

select pg_temp.claim(1);
do $$ begin
  assert public.get_my_pickup_pass(pg_temp.booking_id(1))->>'state' = 'used';
  assert not (public.get_my_pickup_pass(pg_temp.booking_id(1)) ? 'token');
end $$;

reset role;
select pg_temp.claim(null);
do $$ begin
  assert (select payment='paid' and status='picked_up' from public.bookings where id=pg_temp.booking_id(1));
  assert (select count(*)=1 from public.payments where booking_id=pg_temp.booking_id(1) and status='verified' and method='cash');
  assert (select count(*)=1 from public.booking_pickup_events where booking_id=pg_temp.booking_id(1) and kind='pickup_confirmed');
  assert not exists(select 1 from public.booking_pickup_events where booking_id=pg_temp.booking_id(1) and kind='manual');
  assert not exists(select 1 from public.notifications n cross join credentials c where n.booking_id=pg_temp.booking_id(1) and (n.body like '%'||c.token||'%' or n.body like '%'||c.code||'%'));
end $$;

update public.settings set value='true' where key='pickup_return_scan';
set local role authenticated;
select pg_temp.claim(1);
do $$ begin
  assert public.get_my_pickup_pass(pg_temp.booking_id(1))->>'state'='return_ready';
end $$;
select pg_temp.claim(2);
do $$ begin
  assert public.owner_lookup_pickup_pass((select token from credentials where kind='current'))->>'stage'='return';
end $$;
select public.owner_confirm_return(pg_temp.booking_id(1),(select token from credentials where kind='current'),'Keys returned');
reset role;
do $$ begin
  assert (select status='returned' from public.bookings where id=pg_temp.booking_id(1));
end $$;
select pg_temp.claim(null);
update public.bookings set status='confirmed',payment='partial',amount_paid_online=3600
  where id in (pg_temp.booking_id(2),pg_temp.booking_id(3),pg_temp.booking_id(4));
insert into credentials select 'early',token,backup_code from public.booking_pickup_passes where booking_id=pg_temp.booking_id(2);
insert into credentials select 'reset-old',token,backup_code from public.booking_pickup_passes where booking_id=pg_temp.booking_id(3);
update public.bookings set status='cancelled' where id=pg_temp.booking_id(4);
do $$ begin
  assert (select status='revoked' from public.booking_pickup_passes where booking_id=pg_temp.booking_id(4));
end $$;
update public.profiles set verification='pending' where id=pg_temp.person(1);
set local role authenticated;
select pg_temp.claim(2);
do $$ begin
  assert public.owner_lookup_pickup_pass((select token from credentials where kind='early'))->>'result'='NOT_TODAY';
end $$;
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.booking_id(2),(select token from credentials where kind='early'),true,true,'cash','Early agreement')$$,'DOCS_NOT_VERIFIED');
reset role;
select pg_temp.claim(null);
update public.profiles set verification='approved' where id=pg_temp.person(1);
set local role authenticated;
select pg_temp.claim(2);
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.booking_id(2),(select token from credentials where kind='early'),true,true,'cash')$$,'NOT_TODAY');
select public.owner_confirm_pickup(pg_temp.booking_id(2),(select token from credentials where kind='early'),true,true,'cash','Early agreement');
select pg_temp.expect_error($$select public.admin_reset_pickup_pass(pg_temp.booking_id(3),'Reset requested')$$,'PASS_NOT_VALID');
select pg_temp.claim(4);
select public.admin_reset_pickup_pass(pg_temp.booking_id(3),'Reset requested');
select pg_temp.claim(3);
select public.owner_mark_payment_received(pg_temp.booking_id(3),'cash');
select public.owner_set_booking_status(pg_temp.booking_id(3),'picked_up');
reset role;
do $$ begin
  assert exists(select 1 from public.booking_pickup_events where booking_id=pg_temp.booking_id(2) and kind='override' and detail->>'reason'='Early agreement');
  assert exists(select 1 from public.booking_pickup_events where booking_id=pg_temp.booking_id(3) and kind='manual');
  assert (select token <> (select token from credentials where kind='reset-old') and status='used'
    from public.booking_pickup_passes where booking_id=pg_temp.booking_id(3));
  assert (select count(*)=1 from public.payments where booking_id=pg_temp.booking_id(3) and method='cash' and status='verified');
end $$;
rollback;
