-- Run after migrations against a disposable database. All fixtures roll back.
begin;

create function pg_temp.fixture(kind int, n int) returns uuid language sql immutable as $$
  select ('b' || kind::text || '100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.claim(n int) returns text language sql as $$
  select set_config('request.jwt.claims',case when n is null then '{}' else
    jsonb_build_object('sub',pg_temp.fixture(1,n),'role','authenticated')::text end,true)
$$;
create function pg_temp.expect_error(query text,wanted text) returns void language plpgsql as $$
begin
  execute query;
  raise exception 'Expected failure %',wanted;
exception when others then
  assert position(wanted in sqlerrm) > 0 and sqlerrm <> 'Expected failure '||wanted,sqlerrm;
end;
$$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.fixture(1,n),'handover-'||n||'@example.invalid',now(),jsonb_build_object('full_name','Fixture '||n)
from generate_series(1,5) n;
update public.profiles set role='owner' where id in (pg_temp.fixture(1,1),pg_temp.fixture(1,2));
update public.profiles set verification='approved',license_classes=array['car'] where id=pg_temp.fixture(1,5);
insert into public.owners(id,profile_id,business_name,is_active,payment_qr_verified,fee_mode)
select pg_temp.fixture(2,n),pg_temp.fixture(1,n),'Fixture business '||n,true,true,'invoice' from generate_series(1,2) n;
insert into public.cars(id,owner_id,brand,model)
select pg_temp.fixture(3,n),pg_temp.fixture(2,n),'Fixture','Vehicle '||n from generate_series(1,2) n;
insert into public.car_rates(car_id,mode,daily_rate,deposit_amount)
select pg_temp.fixture(3,n),'self_drive',12000,500 from generate_series(1,2) n;
insert into public.bookings(id,car_id,customer_id,mode,start_date,end_date)
select pg_temp.fixture(4,n),pg_temp.fixture(3,vehicle),pg_temp.fixture(1,5),'self_drive',
  (now() at time zone 'Asia/Manila')::date+days,(now() at time zone 'Asia/Manila')::date+days+1
from (values(1,1,0),(2,2,0),(3,1,14)) rows(n,vehicle,days);
insert into public.bookings(id,car_id,customer_id,mode,start_date,end_date)
values(pg_temp.fixture(4,4),pg_temp.fixture(3,2),pg_temp.fixture(1,3),'self_drive',
  (now() at time zone 'Asia/Manila')::date+30,(now() at time zone 'Asia/Manila')::date+31);
update public.bookings set status='confirmed',payment='partial',amount_paid_online=3600
where id in (pg_temp.fixture(4,1),pg_temp.fixture(4,2),pg_temp.fixture(4,3));
update public.settings set value='true' where key='pickup_return_scan';

create temp table staff_invites(key text primary key,data jsonb);
create temp table staff_passes(booking_id uuid primary key, token text,code text);
insert into staff_passes select booking_id,token,backup_code from public.booking_pickup_passes
where booking_id in (pg_temp.fixture(4,1),pg_temp.fixture(4,2),pg_temp.fixture(4,3));
grant select,insert on staff_invites to authenticated;
grant select on staff_passes to authenticated;

set local role authenticated;
select pg_temp.claim(1);
insert into staff_invites values
  ('ana',public.owner_invite_staff('Ana','Handover-3@Example.Invalid')),
  ('expired',public.owner_invite_staff('Expired','handover-4@example.invalid')),
  ('spare',public.owner_invite_staff('Spare','spare@example.invalid'));
select pg_temp.expect_error($$select public.owner_invite_staff('Another','another@example.invalid')$$,'STAFF_LIMIT');
select pg_temp.expect_error($$select public.owner_invite_staff('Ana','handover-3@example.invalid')$$,'STAFF_DUPLICATE');
insert into staff_invites select 'rotated',public.owner_resend_staff_invite((data->>'id')::uuid) from staff_invites where key='ana';
do $$ begin
  assert public.staff_invite_preview((select data->>'token' from staff_invites where key='ana')) is null;
  assert public.owner_staff_limit()=3;
  assert (select count(*)=3 from public.owner_staff where invite_expires_at = now()+interval '7 days');
  assert not has_column_privilege('authenticated','public.owner_staff','invite_token_hash','select');
  assert not has_table_privilege('authenticated','public.owner_staff','update');
end $$;
do $$ begin
  for attempt in 1..6 loop
    perform public.owner_resend_staff_invite((select (data->>'id')::uuid from staff_invites where key='spare'));
  end loop;
end $$;
select pg_temp.expect_error($$select public.owner_resend_staff_invite((select (data->>'id')::uuid from staff_invites where key='spare'))$$,'STAFF_INVITE_RATE');

reset role;
select pg_temp.claim(null);
update public.owner_staff set invite_expires_at=clock_timestamp()-interval '1 day'
where id=(select (data->>'id')::uuid from staff_invites where key='expired');
set local role authenticated;
select pg_temp.claim(4);
select pg_temp.expect_error($$select public.staff_accept_invite((select data->>'token' from staff_invites where key='expired'))$$,'STAFF_INVITE_INVALID');
select pg_temp.expect_error($$select public.staff_accept_invite((select data->>'token' from staff_invites where key='rotated'))$$,'STAFF_INVITE_ACCOUNT');
select pg_temp.claim(3);
select public.staff_accept_invite((select data->>'token' from staff_invites where key='rotated'));
select pg_temp.expect_error($$select public.staff_accept_invite((select data->>'token' from staff_invites where key='rotated'))$$,'STAFF_INVITE_INVALID');

do $$ declare row_data jsonb; begin
  assert (select count(*)=1 and bool_and(enabled) from public.staff_businesses());
  assert (select count(*)=1 from public.owner_staff);
  assert (select count(*)=0 from public.bookings where id=pg_temp.fixture(4,1));
  assert exists(select 1 from public.bookings where id=pg_temp.fixture(4,4));
  assert (select count(*)=0 from public.payments where booking_id=pg_temp.fixture(4,1));
  assert (select count(*)=0 from public.owner_credit_ledger where owner_id=pg_temp.fixture(2,1));
  assert (select count(*)=0 from public.owner_payment_settings);
  assert (select count(*)=0 from public.staff_today_handovers(pg_temp.fixture(2,2)));
  select to_jsonb(h) into row_data from public.staff_today_handovers(pg_temp.fixture(2,1)) h;
  assert row_data is not null and not row_data ?| array['phone','balance_at_pickup','amount','license_path'];
  assert public.owner_lookup_pickup_pass((select token from staff_passes where booking_id=pg_temp.fixture(4,1))) = '{"result":"NOT_VALID"}';
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,1),(select token from staff_passes where booking_id=pg_temp.fixture(4,2))) = '{"result":"NOT_VALID"}';
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,1),p_code=>(
    select lpad(n::text,6,'0') from generate_series(0,3) n
    where not exists(select 1 from staff_passes s where s.code=lpad(n::text,6,'0')) limit 1
  )) = '{"result":"NOT_VALID"}';
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,1),p_code=>(select code from staff_passes where booking_id=pg_temp.fixture(4,1)))->>'result'='OK';
end $$;

select pg_temp.expect_error($$select public.owner_set_booking_status(pg_temp.fixture(4,1),'picked_up')$$,'Booking not found for this owner');
select pg_temp.expect_error($$select public.owner_confirm_pickup(pg_temp.fixture(4,3),(select token from staff_passes where booking_id=pg_temp.fixture(4,3)),true,true,'cash','Early arrangement')$$,'PASS_NOT_VALID');
select pg_temp.expect_error($$select public.staff_confirm_pickup(pg_temp.fixture(2,1),pg_temp.fixture(4,3),(select token from staff_passes where booking_id=pg_temp.fixture(4,3)),true,true,'cash',null)$$,'NOT_TODAY');
select pg_temp.expect_error($$select public.staff_confirm_pickup(pg_temp.fixture(2,1),pg_temp.fixture(4,1),(select token from staff_passes where booking_id=pg_temp.fixture(4,1)),false,true,'cash',null)$$,'ID_CHECK_REQUIRED');
select pg_temp.expect_error($$select public.staff_confirm_pickup(pg_temp.fixture(2,1),pg_temp.fixture(4,1),(select token from staff_passes where booking_id=pg_temp.fixture(4,1)),true,false,null,null)$$,'BALANCE_REQUIRED');

reset role;
select pg_temp.claim(null);
update public.profiles set verification='pending' where id=pg_temp.fixture(1,5);
set local role authenticated;
select pg_temp.claim(3);
select pg_temp.expect_error($$select public.staff_confirm_pickup(pg_temp.fixture(2,1),pg_temp.fixture(4,1),(select token from staff_passes where booking_id=pg_temp.fixture(4,1)),true,true,'cash',null)$$,'DOCS_NOT_VERIFIED');
reset role;
select pg_temp.claim(null);
update public.profiles set verification='approved' where id=pg_temp.fixture(1,5);

set local role authenticated;
select pg_temp.claim(1);
select public.owner_set_staff_status((select (data->>'id')::uuid from staff_invites where key='ana'),'paused');
select pg_temp.claim(3);
do $$ begin
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,1),p_code=>'000000')->>'result'='STAFF_ACCESS_OFF';
  assert (select count(*)=0 from public.staff_today_handovers(pg_temp.fixture(2,1)));
end $$;
select pg_temp.expect_error($$select public.staff_confirm_pickup(pg_temp.fixture(2,1),pg_temp.fixture(4,1),(select token from staff_passes where booking_id=pg_temp.fixture(4,1)),true,true,'cash',null)$$,'STAFF_ACCESS_OFF');
select pg_temp.claim(1);
select public.owner_set_staff_status((select (data->>'id')::uuid from staff_invites where key='ana'),'active');
select pg_temp.claim(3);
select public.staff_confirm_pickup(pg_temp.fixture(2,1),pg_temp.fixture(4,1),null,true,true,'cash',
  (select code from staff_passes where booking_id=pg_temp.fixture(4,1)));
select public.staff_confirm_return(pg_temp.fixture(2,1),pg_temp.fixture(4,1),
  (select token from staff_passes where booking_id=pg_temp.fixture(4,1)),'Keys returned');

select pg_temp.claim(2);
insert into staff_invites values ('second_owner',public.owner_invite_staff('Ana','handover-3@example.invalid'));
select pg_temp.claim(3);
select public.staff_accept_invite((select data->>'token' from staff_invites where key='second_owner'));
do $$ begin
  assert (select count(*)=2 and bool_and(enabled) from public.staff_businesses());
  assert (select count(*)=1 from public.staff_today_handovers(pg_temp.fixture(2,2)));
  assert (select count(*)=0 from public.staff_today_handovers(null));
  for attempt in 1..5 loop
    perform public.staff_lookup_pickup_pass(pg_temp.fixture(2,2),p_code=>'wrong');
  end loop;
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,2),p_code=>'wrong')->>'result'='LOCKED';
end $$;

select pg_temp.claim(1);
select public.owner_confirm_pickup(pg_temp.fixture(4,3),(select token from staff_passes where booking_id=pg_temp.fixture(4,3)),true,true,'cash','Early arrangement');
select public.owner_set_staff_status((select (data->>'id')::uuid from staff_invites where key='ana'),'removed');
do $$ begin
  assert (select count(*)=2 from public.owner_staff_history((select (data->>'id')::uuid from staff_invites where key='ana')));
  assert (select staff_name='Ana' from public.owner_pickup_history() where booking_id=pg_temp.fixture(4,1));
end $$;

reset role;
select pg_temp.claim(null);
update public.owners set is_active=false where id=pg_temp.fixture(2,2);
set local role authenticated;
select pg_temp.claim(3);
do $$ begin
  assert not exists(select 1 from public.staff_businesses() where enabled);
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,2),(select token from staff_passes where booking_id=pg_temp.fixture(4,2)))->>'result'='STAFF_ACCESS_OFF';
end $$;

reset role;
select pg_temp.claim(null);
update public.owners set archived_at=now(),archived_by=pg_temp.fixture(1,1),active_before_archive=false
where id=pg_temp.fixture(2,2);
set local role authenticated;
select pg_temp.claim(3);
do $$ begin
  assert not exists(select 1 from public.staff_businesses() where enabled);
  assert public.staff_lookup_pickup_pass(pg_temp.fixture(2,2),p_code=>'123456')->>'result'='STAFF_ACCESS_OFF';
end $$;

reset role;
select pg_temp.claim(null);
do $$ begin
  assert (select status='returned' and payment='paid' from public.bookings where id=pg_temp.fixture(4,1));
  assert (select used_by=pg_temp.fixture(1,3) from public.booking_pickup_passes where booking_id=pg_temp.fixture(4,1));
  assert (select count(*)=2 from public.booking_pickup_events where booking_id=pg_temp.fixture(4,1) and detail->>'actor_role'='staff' and detail->>'staff_name'='Ana');
  assert (select count(*)=2 from public.audit_log where actor_role='staff' and actor_label='Ana' and entity_id=pg_temp.fixture(4,1)::text);
  assert (select last_handover_at is not null from public.owner_staff where id=(select (data->>'id')::uuid from staff_invites where key='ana'));
  assert exists (select 1 from public.notifications where user_id=pg_temp.fixture(1,1) and type='staff_handover');
  assert exists (select 1 from public.notifications where user_id=pg_temp.fixture(1,5) and type='pickup_confirmed');
end $$;

rollback;
