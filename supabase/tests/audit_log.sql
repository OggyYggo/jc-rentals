-- Run against a disposable database after applying all migrations.
-- The fixtures and audit rows roll back at the end.
begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','audit-admin@example.invalid','{"full_name":"Audit Admin"}'),
 ('a0000000-0000-4000-8000-000000000002','audit-owner@example.invalid','{"full_name":"Audit Owner"}'),
 ('a0000000-0000-4000-8000-000000000003','audit-customer@example.invalid','{"full_name":"Audit Customer"}'),
 ('a0000000-0000-4000-8000-000000000004','audit-applicant@example.invalid','{"full_name":"Audit Applicant"}');

update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'owner' where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set license_path = 'test/license.pdf', id_path = 'test/id.pdf', license_classes = array['car']
 where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set verification = 'approved', license_classes = array['car'] where id = 'a0000000-0000-4000-8000-000000000003';

insert into public.owners(id,profile_id,business_name,fee_mode,payment_qr_verified,deposit_percent)
 values ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','Audit Rentals','invoice',true,0.3);
insert into public.cars(id,owner_id,brand,model,is_active)
 values ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Audit','Vehicle',false);
insert into public.car_rates(car_id,mode,daily_rate) values ('c0000000-0000-4000-8000-000000000001','self_drive',1000);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.admin_set_owner_payment_terms('b0000000-0000-4000-8000-000000000001','invoice',0.03,0.3);
do $$
begin
  assert exists(select 1 from public.audit_log where actor_role = 'admin' and action = 'owner.updated'
    and changes->'commission_rate' = '{"from":"0.0500","to":"0.0300"}' and summary like '%5% → 3%');
  begin
    perform public.admin_log_event('owner.updated','owner',null);
    raise exception 'Unexpected acceptance of unknown action';
  exception when raise_exception then
    assert sqlerrm = 'Unknown audit action.';
  end;
  perform public.admin_log_event('document.viewed','customer','a0000000-0000-4000-8000-000000000003',
    '{"document":"ID","proof_path":"discard-me"}');
  perform public.admin_log_event('audit.exported','audit',null,'{"actor_role":"admin","from":"2026-11-20","unknown":"discard-me"}');
  assert exists(select 1 from public.audit_log where action = 'document.viewed' and metadata = '{"document":"ID"}');
  assert exists(select 1 from public.audit_log where action = 'audit.exported' and metadata = '{"actor_role":"admin","from":"2026-11-20"}');
end;
$$;

reset role;
do $$
declare
  before_count bigint := (select count(*) from public.audit_log);
begin
  update public.owners set commission_rate = commission_rate, created_at = now() - interval '1 day'
    where id = 'b0000000-0000-4000-8000-000000000001';
  assert (select count(*) from public.audit_log) = before_count;
  begin
    update public.owners set business_name = 'Rolled back' where id = 'b0000000-0000-4000-8000-000000000001';
    raise exception 'rollback fixture';
  exception when raise_exception then
    assert sqlerrm = 'rollback fixture';
  end;
  assert (select count(*) from public.audit_log) = before_count;
  update public.owners set contact_phone = '09111234567' where id = 'b0000000-0000-4000-8000-000000000001';
  assert exists(select 1 from public.audit_log where changes = '{"contact_phone":{"masked":true}}');
  update public.owners set business_name = repeat('a', 600) where id = 'b0000000-0000-4000-8000-000000000001';
  assert exists(select 1 from public.audit_log where length(changes->'business_name'->>'to') = 300);
  update public.owners set business_name = 'Audit Rentals' where id = 'b0000000-0000-4000-8000-000000000001';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.cars set is_active = true where id = 'c0000000-0000-4000-8000-000000000001';
do $$
begin
  assert not exists(select 1 from public.audit_log);
  begin
    perform public.admin_log_event('audit.exported','audit',null);
    raise exception 'Unexpected acceptance of non-admin';
  exception when raise_exception then
    assert sqlerrm = 'Administrator access required.';
  end;
end;
$$;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.bookings(car_id,customer_id,mode,start_date,end_date)
 values ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','self_drive',current_date+2,current_date+3);
insert into storage.objects(bucket_id,name)
 select 'payment-proofs', customer_id || '/' || id || '/proof.webp' from public.bookings
 where customer_id = 'a0000000-0000-4000-8000-000000000003';
select public.submit_booking_payment(id,'PRIVATE-REF-09123456789',customer_id || '/' || id || '/proof.webp') from public.bookings
 where customer_id = 'a0000000-0000-4000-8000-000000000003';
do $$ begin assert not exists(select 1 from public.audit_log); end $$;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.reject_booking_payment(p.id,'Proof is blurry') from public.payments p join public.bookings b on b.id = p.booking_id
 where b.customer_id = 'a0000000-0000-4000-8000-000000000003';
do $$
begin
  assert exists(select 1 from public.audit_log where entity_type = 'payment' and reason = 'Proof is blurry' and action = 'payment.status_changed');
  assert exists(select 1 from public.audit_log where entity_type = 'booking' and reason = 'Proof is blurry');
  assert exists(select 1 from public.audit_log where entity_type = 'booking' and actor_role = 'customer');
  assert exists(select 1 from public.audit_log where entity_type = 'car' and actor_role = 'owner' and changes->'is_active'->>'to' = 'true');
  assert not exists(select 1 from public.audit_log where to_jsonb(audit_log)::text like '%PRIVATE-REF%' or to_jsonb(audit_log)::text like '%test/license%');
  assert nullif(current_setting('app.audit_reason', true), '') is null;
end;
$$;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.bookings(car_id,customer_id,mode,start_date,end_date)
 values ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','self_drive',current_date+5,current_date+6);
insert into storage.objects(bucket_id,name)
 select 'payment-proofs', customer_id || '/' || id || '/proof.webp' from public.bookings
 where customer_id = 'a0000000-0000-4000-8000-000000000003' and start_date = current_date+5;
select public.submit_booking_payment(id,'AUDIT-CONFIRM',customer_id || '/' || id || '/proof.webp') from public.bookings
 where customer_id = 'a0000000-0000-4000-8000-000000000003' and start_date = current_date+5;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.confirm_booking_payment(id,amount,reference_no) from public.payments where reference_no = 'AUDIT-CONFIRM';

reset role;
do $$
begin
  assert exists(select 1 from public.audit_log where actor_role = 'owner' and action = 'booking.status_changed'
     and changes->'status'->>'to' = 'confirmed' and reason is null);
  assert exists(select 1 from public.notifications where type = 'payment_verified' and user_id = 'a0000000-0000-4000-8000-000000000003');
end;
$$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','{}',true);
-- Ensure expiry is attributed to the scheduler.
insert into public.bookings(car_id,customer_id,mode,start_date,end_date)
 values ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','self_drive',current_date+8,current_date+9);
update public.bookings set payment_due_at = now() - interval '1 hour', payment_resubmit_due_at = null where customer_id = 'a0000000-0000-4000-8000-000000000003';
select public.expire_unpaid_bookings();
do $$
begin
  assert exists(select 1 from public.audit_log where action = 'booking.status_changed' and actor_label = 'cron:expire_unpaid_bookings'
    and actor_role = 'system' and changes->'status'->>'to' = 'expired');
  assert nullif(current_setting('app.audit_actor', true), '') is null;
end;
$$;

insert into public.owner_applications(id,full_name,business_name,email,phone,car_make,car_model,daily_rate_self_drive)
 values ('d0000000-0000-4000-8000-000000000001','Audit Applicant','Audit Applicant Rentals','audit-applicant@example.invalid',
 '09112223333','Audit','Draft',900);
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.admin_complete_owner_application('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004');
do $$
begin
  assert exists(select 1 from public.audit_log where entity_id = 'd0000000-0000-4000-8000-000000000001'
    and actor_role = 'admin' and changes->'status'->>'to' = 'approved');
  assert exists(select 1 from public.audit_log where entity_type = 'car_rate' and actor_role = 'admin');
end;
$$;

reset role;
insert into public.owner_credit_ledger(owner_id,type,amount,status)
 values ('b0000000-0000-4000-8000-000000000001','topup',100,'pending');
select public.admin_review_owner_topup(id,false,'Transfer could not be verified') from public.owner_credit_ledger
 where owner_id = 'b0000000-0000-4000-8000-000000000001' and type = 'topup';
insert into public.commission_invoices(owner_id,period_month)
 values ('b0000000-0000-4000-8000-000000000001',date_trunc('month',current_date)::date);
insert into public.promo_codes(owner_id,code,discount_type,discount_value)
 values ('b0000000-0000-4000-8000-000000000001','AUDIT-TEST','fixed',100);
insert into public.drivers(owner_id,full_name,phone)
 values ('b0000000-0000-4000-8000-000000000001','Audit Driver','09112223333');
insert into public.pickup_locations(owner_id,name,address)
 values ('b0000000-0000-4000-8000-000000000001','Audit Pickup','Audit Street');
insert into public.plan_payments(owner_id,plan_id,amount,reference_no,proof_path)
 select 'b0000000-0000-4000-8000-000000000001',id,100,'private-plan-reference','test/proof.pdf'
 from public.plans where code = 'starter';
insert into public.contact_messages(full_name,email,topic,message)
 values ('Audit Contact','audit-contact@example.invalid','booking','Sample inquiry for audit testing');
update public.contact_messages set status = 'resolved' where email = 'audit-contact@example.invalid';
update public.settings set value = '"test/private-qr.png"' where key = 'platform_qr_path';
update public.plans set price_php = price_php + 1 where code = 'starter';
delete from public.promo_codes where code = 'AUDIT-TEST';

do $$
declare
  entity text;
begin
  foreach entity in array array['owner','customer','application','booking','payment','topup','car','car_rate','invoice',
    'setting','promo','driver','pickup_location','plan','owner_plan','plan_payment','contact'] loop
    assert exists(select 1 from public.audit_log where entity_type = entity), 'Missing audit record for ' || entity;
  end loop;
  assert exists(select 1 from public.audit_log where action = 'promo.deleted');
  assert public.audit_safe_note('Retry for 0911 222 3333 at https://example.invalid/private.pdf token = fixture-value')
    = 'Retry for [redacted] at [redacted] [redacted]';
  assert exists(select 1 from public.audit_log where action = 'topup.status_changed' and reason = 'Transfer could not be verified');
  assert not has_table_privilege('authenticated', 'public.audit_log', 'INSERT, UPDATE, DELETE, TRUNCATE');
  assert not has_table_privilege('service_role', 'public.audit_log', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE');
  assert exists(select 1 from public.audit_log where entity_id = 'platform_qr_path' and changes->'value' = '{"masked":true}');
  assert not exists(select 1 from public.audit_log where to_jsonb(audit_log)::text like '%private-qr.png%'
    or to_jsonb(audit_log)::text like '%private-plan-reference%');
end;
$$;

insert into public.audit_log(actor_role,action,entity_type,entity_id,summary)
 select 'system','booking.updated','booking','performance-fixture','Sample event' from generate_series(1,10000);
analyze public.audit_log;
explain (analyze, buffers)
 select id, summary from public.audit_log where entity_type = 'booking' and entity_id = 'performance-fixture'
 and id < (select max(id) from public.audit_log) order by id desc limit 50;

set local role authenticated;

-- API-role ACLs reject mutation before execution. The triggers also reject it for the table owner.
do $$
begin
  begin update public.audit_log set reason = 'mutated'; raise exception 'Admin update permitted';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role service_role;
do $$
begin
  begin delete from public.audit_log; raise exception 'Service delete permitted';
  exception when insufficient_privilege then null; end;
  begin truncate public.audit_log; raise exception 'Service truncate permitted';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin perform 1 from public.audit_log; raise exception 'Anonymous read permitted';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_log_event('audit.exported','audit',null); raise exception 'Anonymous RPC permitted';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
begin
  begin update public.audit_log set reason = 'mutated'; exception when raise_exception then
    assert sqlerrm = 'The audit log is append-only.';
    return;
  end;
  raise exception 'Audit update permitted for table owner';
end;
$$;
do $$
begin
  begin delete from public.audit_log; exception when raise_exception then
    assert sqlerrm = 'The audit log is append-only.';
    return;
  end;
  raise exception 'Audit delete permitted for table owner';
end;
$$;
do $$
begin
  begin truncate public.audit_log; exception when raise_exception then
    assert sqlerrm = 'The audit log is append-only.';
    return;
  end;
  raise exception 'Audit truncate permitted for table owner';
end;
$$;
rollback;
