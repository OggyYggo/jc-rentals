-- Run after all migrations in a disposable database. Every fixture rolls back.
begin;

create function pg_temp.person(n int) returns uuid language sql immutable as $$
  select ('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.owner_id(n int) returns uuid language sql immutable as $$
  select ('ac200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.car_id(n int) returns uuid language sql immutable as $$
  select ('ac300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.booking_id(n int) returns uuid language sql immutable as $$
  select ('ac400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
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


create function pg_temp.qr(n int, provider text) returns text language sql immutable as $$
  select pg_temp.owner_id(n)||'/'||provider||'.webp'
$$;
create function pg_temp.option_id(n int, provider_name text) returns uuid language sql stable as $$
  select id from public.owner_payment_options where owner_id = pg_temp.owner_id(n) and provider = provider_name
$$;

insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.person(n),'option-test-'||n||'@example.invalid',jsonb_build_object('full_name','Payment option fixture '||n)
from generate_series(1,5) n;
update public.profiles set verification='approved',license_classes=array['car'] where id=pg_temp.person(1);
update public.profiles set role='owner' where id in (pg_temp.person(2),pg_temp.person(3));
update public.profiles set role='admin' where id=pg_temp.person(4);
insert into public.owners(id,profile_id,business_name,fee_mode)
values (pg_temp.owner_id(1),pg_temp.person(2),'Option One','invoice'),
       (pg_temp.owner_id(2),pg_temp.person(3),'Option Two','invoice');
insert into storage.objects(bucket_id,name)
values ('owner-qr',pg_temp.qr(1,'gcash')),('owner-qr',pg_temp.qr(1,'maya')),
       ('owner-qr',pg_temp.qr(1,'maya-revised')),('owner-qr',pg_temp.qr(1,'bpi')),
       ('owner-qr',pg_temp.qr(2,'gcash'));

set local role authenticated;
select pg_temp.claim(2);
select public.owner_save_payment_option(null,'gcash','GCash','Account One','0917 555 1234',pg_temp.qr(1,'gcash'));
select public.owner_save_payment_option(null,'maya','Maya','Account One',null,pg_temp.qr(1,'maya'),true);
select public.owner_save_payment_option(null,'bpi','BPI','Account One',null,pg_temp.qr(1,'bpi'));
select public.owner_reorder_payment_options(array[pg_temp.option_id(1,'bpi'),pg_temp.option_id(1,'maya'),pg_temp.option_id(1,'gcash')]);
select pg_temp.expect_error($$select public.owner_save_payment_option(null,'other_qrph','Test','Account One',null,pg_temp.qr(2,'gcash'))$$,'Choose a QR image');
select pg_temp.expect_error($$select public.admin_set_payment_option_verified(pg_temp.option_id(1,'maya'),true)$$,'Administrator access required');
do $$ begin
  assert (select account_hint = '•••• 1234' from public.owner_payment_options where provider='gcash');
  assert not public.owner_can_accept(pg_temp.owner_id(1));
end $$;

select pg_temp.claim(3);
select public.owner_save_payment_option(null,'gcash','GCash','Account Two',null,pg_temp.qr(2,'gcash'));
do $$ begin
  assert not exists(select 1 from public.owner_payment_options where owner_id=pg_temp.owner_id(1));
end $$;

select pg_temp.claim(4);
select public.admin_set_payment_option_verified(pg_temp.option_id(1,'bpi'),true);
select public.admin_set_payment_option_verified(pg_temp.option_id(1,'gcash'),true);
select public.admin_set_payment_option_verified(pg_temp.option_id(1,'maya'),true);
select public.admin_set_payment_option_verified(pg_temp.option_id(2,'gcash'),true);
do $$ begin
  assert (select payment_qr_verified and payment_method_label='Maya' and payment_qr_path=pg_temp.qr(1,'maya')
    from public.owners where id=pg_temp.owner_id(1));
end $$;
-- Store the ID before switching to a customer, who cannot query the option table.
select set_config('test.cross_owner_option',pg_temp.option_id(2,'gcash')::text,true);
reset role;
insert into public.cars(id,owner_id,brand,model)
select pg_temp.car_id(n),pg_temp.owner_id(n),'Fixture','Car '||n from generate_series(1,2) n;
select pg_temp.claim(null);
insert into public.car_rates(car_id,mode,daily_rate,deposit_amount)
select pg_temp.car_id(n),'self_drive',12000,500 from generate_series(1,2) n;
select pg_temp.create_booking(1,1);
select pg_temp.create_booking(2,2);
insert into storage.objects(bucket_id,name) values ('payment-proofs',pg_temp.object_path(1));

set local role anon;
do $$ begin
  assert (select count(*) from public.get_owner_accepted_providers(pg_temp.owner_id(1)))=3;
  assert not has_table_privilege('anon','public.owner_payment_options','SELECT');
  assert not has_function_privilege('anon','public.get_booking_payment_options(uuid)','EXECUTE');
end $$;

set local role authenticated;
select pg_temp.claim(5);
do $$ begin
  assert not exists(select 1 from public.get_booking_payment_options(pg_temp.booking_id(1)));
  assert not exists(select 1 from public.owner_payment_options);
end $$;

select pg_temp.claim(1);
do $$ begin
  assert (select array_agg(provider) from public.get_booking_payment_options(pg_temp.booking_id(1)))=array['maya','bpi','gcash'];
  assert (select count(*) from public.get_booking_payment_options(pg_temp.booking_id(2)))=1;
end $$;
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(1),'OPTION-123',pg_temp.object_path(1),
  current_setting('test.cross_owner_option')::uuid)$$,'PAYMENT_OPTION_UNAVAILABLE');

-- Exercise the insert trigger independently of the RPC, as the table's privileged role.
reset role;
select pg_temp.expect_error($$insert into public.payments (booking_id,amount,method,reference_no,proof_path,payment_option_id)
select id,amount_due_now,'owner_qr','OPTION-123',pg_temp.object_path(1),current_setting('test.cross_owner_option')::uuid
from public.bookings where id=pg_temp.booking_id(1)$$,'PAYMENT_OPTION_UNAVAILABLE');

set local role authenticated;
select public.submit_booking_payment(pg_temp.booking_id(1),'OPTION-123',pg_temp.object_path(1),
  (select id from public.get_booking_payment_options(pg_temp.booking_id(1)) where provider='maya'));
select pg_temp.claim(2);
do $$ begin
  assert exists(select 1 from public.payments where booking_id=pg_temp.booking_id(1)
    and payment_option_id=pg_temp.option_id(1,'maya') and payment_provider='maya' and payment_label='Maya');
end $$;
select public.owner_save_payment_option(pg_temp.option_id(1,'maya'),'maya','Maya Updated','Account One',null,pg_temp.qr(1,'maya-revised'));
do $$ begin
  assert not (select verified from public.owner_payment_options where id=pg_temp.option_id(1,'maya'));
  assert not (select payment_qr_verified from public.owners where id=pg_temp.owner_id(1));
  assert public.owner_can_accept(pg_temp.owner_id(1));
end $$;
select public.owner_remove_payment_option(pg_temp.option_id(1,'maya'));
do $$ begin
  assert exists(select 1 from public.payments where booking_id=pg_temp.booking_id(1)
    and payment_provider='maya' and payment_label='Maya');
end $$;

select pg_temp.claim(4);
select public.admin_set_payment_option_verified(pg_temp.option_id(1,'bpi'),false,'Review the QR account.');
select public.admin_set_payment_option_verified(pg_temp.option_id(1,'gcash'),false,'Review the QR account.');
do $$ begin
  assert not public.owner_can_accept(pg_temp.owner_id(1));
end $$;
select pg_temp.claim(1);
do $$ begin
  assert not exists(select 1 from public.get_booking_payment_options(pg_temp.booking_id(1)));
end $$;
select pg_temp.claim(3);
select pg_temp.expect_error($$select public.owner_remove_payment_option(pg_temp.option_id(2,'gcash'))$$,
  'Keep one verified option while bookings are awaiting payment');

reset role;
select pg_temp.claim(null);
insert into auth.users(id,email) values (pg_temp.person(6),'guest-option@example.invalid');
insert into public.owner_applications(id,full_name,business_name,email,phone,car_make,car_model,payment_qr_path)
values (pg_temp.booking_id(6),'Guest owner','Guest Rental','guest-option@example.invalid','09000000006',
  'Fixture','Guest Car',pg_temp.booking_id(6)||'/payment_qr/qr.webp');
insert into storage.objects(bucket_id,name)
values ('owner-applications',pg_temp.booking_id(6)||'/payment_qr/qr.webp');

set local role authenticated;
select pg_temp.claim(4);
select public.admin_complete_owner_application(pg_temp.booking_id(6),pg_temp.person(6));
do $$ begin
  assert exists(select 1 from public.owner_payment_options p join public.owners o on o.id=p.owner_id
    where o.profile_id=pg_temp.person(6) and p.is_preferred and not p.verified
      and p.qr_bucket='owner-applications' and o.payment_qr_path=p.qr_path);
end $$;
select pg_temp.claim(2);
do $$ begin
  assert exists(select 1 from public.notifications where user_id=pg_temp.person(2) and type='qr_rejected');
end $$;

rollback;
