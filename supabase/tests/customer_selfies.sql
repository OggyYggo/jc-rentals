begin;
insert into auth.users(id,email,raw_user_meta_data) values
  ('aa110000-0000-4000-8000-000000000001','selfie-customer@example.invalid','{}'),
  ('aa110000-0000-4000-8000-000000000002','selfie-peer@example.invalid','{}'),
  ('aa110000-0000-4000-8000-000000000003','selfie-admin@example.invalid','{}');
update public.profiles set role='admin' where id='aa110000-0000-4000-8000-000000000003';
insert into public.customer_selfies(customer_id,revision) values
  ('aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.sub','aa110000-0000-4000-8000-000000000002',true);
do $$ begin
  assert not exists (select 1 from public.customer_selfies);
  begin
    perform public.admin_review_customer_selfie('aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000004',true);
    raise exception 'Non-admin review was allowed';
  exception when others then assert sqlerrm = 'Not allowed.'; end;
end $$;

select set_config('request.jwt.claim.sub','aa110000-0000-4000-8000-000000000003',true);
select public.admin_log_customer_selfie_view('aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000004');
do $$ begin
  begin
    perform public.admin_review_customer_selfie('aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000005',true);
    raise exception 'Stale revision was accepted';
  exception when others then assert sqlerrm like 'This selfie changed%'; end;
end $$;
select public.admin_review_customer_selfie('aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.sub','aa110000-0000-4000-8000-000000000001',true);
do $$ begin
  assert (select status='approved' from public.customer_selfies);
  assert not has_table_privilege('authenticated','public.customer_selfies','update');
  assert not has_function_privilege('anon','public.admin_review_customer_selfie(uuid,uuid,boolean)','execute');
end $$;
reset role;
do $$ begin
  assert (select not public from storage.buckets where id='customer-selfies');
  assert (select count(*)=2 from public.audit_log where entity_id='aa110000-0000-4000-8000-000000000001'
    and action in ('document.viewed','document.selfie_reviewed'));
end $$;
rollback;
