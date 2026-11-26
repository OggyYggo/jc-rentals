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
  assert public.create_gateway_topup('KBT-000000000001', owner_a, 500, 'GCASH');
  assert public.create_gateway_topup('KBT-000000000002', owner_b, 500, 'MAYA');
  perform public.review_gateway_callback('KBT-000000000001');
  assert exists (select from public.gateway_topups where order_id = 'KBT-000000000001'
    and status = 'created' and callback_count = 1 and needs_review);
  assert public.post_gateway_topup('KBT-000000000001', 500) = 'paid';
  for attempt in 1..3 loop
    assert public.post_gateway_topup('KBT-000000000001', 500) = 'already_paid';
  end loop;

  update public.gateway_topups set created_at = now() - interval '2 hours'
  where order_id = 'KBT-000000000002';
  begin
    perform public.post_gateway_topup('KBT-000000000002', 500);
    raise exception 'Unexpected payment posting for expired order';
  exception when raise_exception then
    assert sqlerrm = 'Order is no longer open';
  end;
  perform public.review_gateway_callback('KBT-000000000002');
  assert exists (select from public.gateway_topups where order_id = 'KBT-000000000002'
    and status = 'expired' and needs_review);

  for attempt in 3..6 loop
    assert public.create_gateway_topup('KBT-' || lpad(attempt::text, 12, '0'), owner_a, 500, 'GCASH');
  end loop;
  assert not public.create_gateway_topup('KBT-000000000007', owner_a, 500, 'GCASH');
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
  assert not has_function_privilege('public.create_gateway_topup(text,uuid,numeric,text)', 'execute');
  assert not has_function_privilege('public.review_gateway_callback(text)', 'execute');
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
