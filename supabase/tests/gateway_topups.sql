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
  assert not has_function_privilege('public.apply_quickpay_event(text,text,text,text,numeric,text,boolean)', 'execute');
end;
$$;

-- Submit the same ledger entry as the manual QR form, then use the existing admin RPC.
insert into public.owner_credit_ledger (id, owner_id, type, amount, status, reference_no, proof_path, note)
values ('c2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-000000000001',
  'topup', 100.25, 'pending', 'manual-gateway-regression', 'b2600000-0000-4000-8000-000000000001/proof.png',
  'Owner credit top-up request');

select set_config('request.jwt.claim.sub','a2600000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a2600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.admin_review_owner_topup('c2600000-0000-4000-8000-000000000001', true, null);
do $$
begin
  assert (select balance from public.owner_credit_state('b2600000-0000-4000-8000-000000000001')) = 600.25;
  assert exists (select from public.owner_credit_ledger where id = 'c2600000-0000-4000-8000-000000000001'
    and status = 'posted' and note = 'Top-up verified.');
end;
$$;

rollback;
