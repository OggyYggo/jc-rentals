-- Run against a disposable database after applying all migrations.
begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('a2600000-0000-4000-8000-000000000001','gateway-owner-a@example.invalid','{"full_name":"Gateway Owner A"}'),
 ('a2600000-0000-4000-8000-000000000002','gateway-owner-b@example.invalid','{"full_name":"Gateway Owner B"}'),
 ('a2600000-0000-4000-8000-000000000003','gateway-admin@example.invalid','{"full_name":"Gateway Admin"}');

update public.profiles set role = 'owner'
where id in ('a2600000-0000-4000-8000-000000000001', 'a2600000-0000-4000-8000-000000000002');
update public.profiles set role = 'admin' where id = 'a2600000-0000-4000-8000-000000000003';

insert into public.owners(id,profile_id,business_name,is_active,fee_mode) values
 ('b2600000-0000-4000-8000-000000000001','a2600000-0000-4000-8000-000000000001','Gateway Owner A',true,'credits'),
 ('b2600000-0000-4000-8000-000000000002','a2600000-0000-4000-8000-000000000002','Gateway Owner B',true,'credits');

set local role service_role;
do $$
declare
  owner_a constant uuid := 'b2600000-0000-4000-8000-000000000001';
  owner_b constant uuid := 'b2600000-0000-4000-8000-000000000002';
begin
  assert public.create_gateway_topup('KBT-000000000001', owner_a, 500, 'gcash', false);
  assert public.create_gateway_topup('KBT-000000000002', owner_b, 500, null, false);
  update public.gateway_topups set provider_checkout_id = 'cs_' || order_id;
  begin
    perform public.apply_quickpay_event('evt_paid', 'checkout.paid', 'KBT-000000000001',
      'post', 501, 'cs_KBT-000000000001', false);
    raise exception 'Unexpected payment posting for wrong amount';
  exception when raise_exception then
    assert sqlerrm = 'Order or amount does not match';
  end;
  assert not exists (select from public.gateway_webhook_events where event_id = 'evt_paid');

  perform public.apply_quickpay_event('evt_extra', 'checkout.extra_payment', 'KBT-000000000001',
    'extra', 500, 'cs_KBT-000000000001', false);
  perform public.apply_quickpay_event('evt_paid', 'checkout.paid', 'KBT-000000000001',
    'post', 500, 'cs_KBT-000000000001', false);
  for attempt in 1..3 loop
    perform public.apply_quickpay_event('evt_paid', 'checkout.paid', 'KBT-000000000001',
      'post', 500, 'cs_KBT-000000000001', false);
    assert public.post_gateway_topup('KBT-000000000001', 500) = 'already_paid';
  end loop;
  assert exists (select from public.gateway_topups where order_id = 'KBT-000000000001'
    and status = 'needs_review' and ledger_id is not null and callback_count = 1 and not livemode);

  perform public.apply_quickpay_event('evt_expired', 'checkout.expired', 'KBT-000000000002',
    'expire', 500, 'cs_KBT-000000000002', false);
  assert exists (select from public.gateway_topups where order_id = 'KBT-000000000002'
    and status = 'expired');
  perform public.apply_quickpay_event('evt_late', 'checkout.paid', 'KBT-000000000002',
    'post', 500, 'cs_KBT-000000000002', false);
  assert exists (select from public.gateway_topups where order_id = 'KBT-000000000002'
    and status = 'needs_review' and ledger_id is null);

  for attempt in 3..6 loop
    assert public.create_gateway_topup('KBT-' || lpad(attempt::text, 12, '0'), owner_a, 500, 'gcash', false);
  end loop;
  assert not public.create_gateway_topup('KBT-000000000007', owner_a, 500, 'gcash', false);
end;
$$;

reset role;
do $$
begin
  assert (select count(*) from public.owner_credit_ledger
    where reference_no in ('KBT-000000000001','KBT-000000000002')) = 1;
  assert (select balance from public.calculate_owner_credit_state('b2600000-0000-4000-8000-000000000001')) = 500;
  assert (select count(*) from public.audit_log
    where action = 'topup.gateway_paid' and metadata->>'order_id' = 'KBT-000000000001') = 1;
  assert (select count(*) from public.notifications
    where user_id = 'a2600000-0000-4000-8000-000000000001' and title = 'Credits added') = 1;
  assert (select count(*) from public.notifications
    where user_id = 'a2600000-0000-4000-8000-000000000003' and title = 'Extra QuickPay payment') = 1;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  assert exists (select from public.gateway_topups where order_id = 'KBT-000000000001');
  assert not exists (select from public.gateway_topups where order_id = 'KBT-000000000002');
  assert not has_table_privilege('public.gateway_topups', 'insert');
  assert not has_table_privilege('public.gateway_topups', 'update');
  assert not has_table_privilege('public.gateway_topups', 'delete');
  assert not has_function_privilege('public.post_gateway_topup(text,numeric)', 'execute');
  assert not has_table_privilege('public.gateway_webhook_events', 'select');
  assert not has_function_privilege('public.create_gateway_topup(text,uuid,numeric,text,boolean)', 'execute');
  assert not has_function_privilege('public.record_gateway_event(text,text,text,text)', 'execute');
  assert not has_function_privilege('public.expire_gateway_topup(text)', 'execute');
  assert not has_function_privilege('public.reserve_quickpay_checkout(text,uuid,numeric,text,boolean,uuid)', 'execute');
  assert not has_table_privilege('public.owner_credit_ledger', 'insert');
  assert not has_function_privilege('public.apply_quickpay_event(text,text,text,text,numeric,text,boolean)', 'execute');
end;
$$;

-- Manual top-ups require a stored proof and explicit transfer attestation.
reset role;
insert into storage.objects (bucket_id, name) values
 ('topup-proofs', 'b2600000-0000-4000-8000-000000000001/proof.png'),
 ('topup-proofs', 'b2600000-0000-4000-8000-000000000001/duplicate.png');
set local role authenticated;
select public.submit_owner_topup(100.25, 'manual-gateway-regression',
  'b2600000-0000-4000-8000-000000000001/proof.png');
do $$ begin
  begin
    perform public.submit_owner_topup(100.25, 'MANUAL gateway REGRESSION',
      'b2600000-0000-4000-8000-000000000001/duplicate.png');
    raise exception 'Duplicate reference unexpectedly accepted';
  exception when raise_exception then
    assert sqlerrm = 'That top-up reference or proof has already been used.', sqlerrm;
  end;
  begin
    perform public.submit_owner_topup(100.25, 'unused-reference',
      'b2600000-0000-4000-8000-000000000002/foreign.png');
    raise exception 'Foreign or missing proof unexpectedly accepted';
  exception when raise_exception then
    assert sqlerrm = 'Upload a valid top-up proof for this owner.', sqlerrm;
  end;
end $$;
select set_config('request.jwt.claim.sub','a2600000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a2600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.admin_review_owner_topup(id, true, null, 99, 'manual-gateway-regression')
    from public.owner_credit_ledger where reference_no = 'manual-gateway-regression';
    raise exception 'Mismatched transfer unexpectedly approved';
  exception when raise_exception then
    assert sqlerrm = 'Enter the amount and reference from the verified transfer.', sqlerrm;
  end;
end $$;
select public.admin_review_owner_topup(id, true, null, 100.25, 'Manual Gateway Regression')
from public.owner_credit_ledger where reference_no = 'manual-gateway-regression';
do $$
begin
  assert (select balance from public.owner_credit_state('b2600000-0000-4000-8000-000000000001')) = 600.25;
  assert exists (select from public.owner_credit_ledger where reference_no = 'manual-gateway-regression'
    and status = 'posted' and note = 'Top-up verified.');
end;
$$;

reset role;
set local role service_role;
do $$
declare
  owner_b constant uuid := 'b2600000-0000-4000-8000-000000000002';
  attempt_key constant uuid := '01234567-89ab-4cde-8f00-0123456789ab';
  reservation jsonb;
begin
  reservation := public.reserve_quickpay_checkout('KBT-000000000010', owner_b, 500, 'maya', false, attempt_key);
  assert reservation->>'outcome' = 'reserved';
  assert public.reserve_quickpay_checkout('KBT-000000000011', owner_b, 500, 'maya', false, attempt_key)->>'outcome' = 'in_progress';
  assert public.reserve_quickpay_checkout('KBT-000000000011', owner_b, 600, 'maya', false, attempt_key)->>'outcome' = 'mismatch';
  update public.gateway_topups set checkout_lease_until = clock_timestamp() - interval '1 second'
    where order_id = 'KBT-000000000010';
  reservation := public.reserve_quickpay_checkout('KBT-000000000011', owner_b, 500, 'maya', false, attempt_key);
  assert reservation = '{"outcome":"reserved","orderId":"KBT-000000000010"}'::jsonb;
  update public.gateway_topups set payment_url = 'https://checkout.example/c/fixture'
    where order_id = 'KBT-000000000010';
  assert public.reserve_quickpay_checkout('KBT-000000000011', owner_b, 500, 'maya', false, attempt_key)->>'outcome' = 'ready';
  assert (select count(*) from public.gateway_topups where checkout_attempt_key = attempt_key and owner_id = owner_b) = 1;
end;
$$;

rollback;
