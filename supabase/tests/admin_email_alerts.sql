-- Run only on a disposable database after applying the migrations.
begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('e0000000-0000-4000-8000-000000000001','fixture-admin@example.invalid','{"full_name":"Fixture Admin"}'),
 ('e0000000-0000-4000-8000-000000000002','fixture-owner@example.invalid','{}');
update public.profiles set role='admin' where id='e0000000-0000-4000-8000-000000000001';
update public.profiles set role='owner' where id='e0000000-0000-4000-8000-000000000002';
insert into public.owners(id,profile_id,business_name)
 values ('e1000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','Fixture Rentals');
update public.owners set commission_rate=0.03 where id='e1000000-0000-4000-8000-000000000001';
do $$ begin
  assert exists(select 1 from public.admin_alert_queue where event_key='security.commission_changed');
  assert exists(select 1 from public.audit_log where action='owner.updated');
  assert not has_function_privilege('anon','public.admin_alert(text,text,text,text,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.admin_alert(text,text,text,text,text)','EXECUTE');
  assert not has_table_privilege('authenticated','public.admin_alert_queue','INSERT, UPDATE, DELETE');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  assert not exists(select id from public.admin_alert_queue);
  begin
    perform public.admin_set_alert_recipients(array['new@example.invalid']);
    raise exception 'Non-admin recipient change allowed';
  exception when raise_exception then
    assert sqlerrm='Administrator access required.';
  end;
end $$;

select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.admin_set_alert_rule('security.settings_changed','off');
    raise exception 'Locked rule was turned off';
  exception when raise_exception then assert sqlerrm='Security alerts must stay on.'; end;
  begin
    perform public.admin_set_alert_recipients(array['invalid']);
    raise exception 'Invalid recipient accepted';
  exception when raise_exception then assert sqlerrm='Enter one to five valid email addresses.'; end;
  begin
    perform public.admin_set_alert_recipients(array_fill('email@example.invalid'::text,array[6]));
    raise exception 'Too many recipients accepted';
  exception when raise_exception then assert sqlerrm='Enter one to five valid email addresses.'; end;
  assert public.admin_set_alert_recipients(array[' OLD@example.invalid '])='{}'::text[];
  assert public.admin_set_alert_recipients(array['new@example.invalid'])=array['old@example.invalid'];
  assert (select count(id) from public.admin_alert_queue where title='Test email')=2;
  perform public.admin_queue_test_alert();
  perform public.admin_queue_test_alert();
  perform public.admin_queue_test_alert();
  begin
    perform public.admin_queue_test_alert();
    raise exception 'Test email rate limit ignored';
  exception when raise_exception then assert sqlerrm='You can send up to three test emails per hour.'; end;
  perform public.admin_set_alert_rule('application.submitted','digest');
end $$;

reset role;
do $$ begin
  assert exists(select 1 from public.admin_alert_queue where kind='old_recipients'
    and recipient_snapshot=array['old@example.invalid'] and body like '%n***@example.invalid%');
  assert not exists(select 1 from public.audit_log where action='alert.recipients_updated'
    and (changes::text like '%old@example.invalid%' or changes::text like '%new@example.invalid%'));
end $$;

set local role service_role;
select public.admin_alert('application.submitted','Application',null,'/admin/owner-applications','app-1');
select public.admin_alert('application.submitted','Application duplicate',null,'/admin/owner-applications','app-1');
select public.admin_alert('unknown.event','Ignored');
do $$ begin
  assert (select count(*) from public.admin_alert_queue where dedupe_key='app-1' and status='digest')=1;
  assert not exists(select 1 from public.admin_alert_queue where event_key='unknown.event');
  begin
    perform public.admin_alert('contact.message','Bad path',null,'/admin/../login');
    raise exception 'Invalid path accepted';
  exception when check_violation then null; end;
end $$;

reset role;
update public.admin_alert_rules set mode='off' where event_key='application.submitted';
select public.admin_alert('application.submitted','Ignored while off',null,'/admin','app-off');
do $$ begin assert not exists(select 1 from public.admin_alert_queue where dedupe_key='app-off'); end $$;

-- A failing alert insert must never roll back a change or its audit entry.
create function pg_temp.reject_alert() returns trigger language plpgsql as $$begin raise exception 'Fixture queue failure'; end$$;
create trigger reject_alert_fixture before insert on public.admin_alert_queue for each row execute function pg_temp.reject_alert();
update public.owners set commission_rate=0.04 where id='e1000000-0000-4000-8000-000000000001';
drop trigger reject_alert_fixture on public.admin_alert_queue;
do $$ begin
  assert exists(select 1 from public.audit_log where action='owner.updated' and (changes->'commission_rate'->>'to')::numeric=0.04);
end $$;

-- A full hour's worth of sends moves five fresh events into the digest.
delete from public.admin_alert_queue where status='pending';
select public.admin_alert('contact.message','Contact',null,'/admin','fixture-' || i) from generate_series(1,25) i;
do $$
declare target record; claimed public.admin_alert_queue;
begin
  for target in select id from public.admin_alert_queue where dedupe_key like 'fixture-%' order by dedupe_key loop
    select * into claimed from public.claim_admin_alert(target.id,array['fallback@example.invalid']);
    if not found then continue; end if;
    assert claimed.recipient_snapshot=array['new@example.invalid'];
    assert not exists(select 1 from public.claim_admin_alert(target.id,array['fallback@example.invalid']));
    assert not public.finish_admin_alert(target.id,gen_random_uuid(),null);
    assert public.finish_admin_alert(target.id,claimed.lease_token,null);
  end loop;
  assert (select count(*) from public.admin_alert_queue where status='sent')=20;
  assert (select count(*) from public.admin_alert_queue where status='digest' and dedupe_key like 'fixture-%')=5;
end $$;

do $$
declare batch uuid; claimed public.admin_alert_queue;
begin
  batch := public.prepare_admin_digest();
  assert batch is not null;
  assert public.prepare_admin_digest()=batch;
  select * into claimed from public.claim_admin_alert(batch,'{}');
  assert claimed.digest_data->'events' <> '[]';
  assert public.finish_admin_alert(batch,claimed.lease_token,null);
  assert public.prepare_admin_digest() is null;
  assert (select count(*) from public.admin_alert_queue where digest_batch=batch and status='digested')=6;
end $$;

delete from public.admin_alert_queue where kind='daily';
update public.admin_alert_config set last_digest_on=null;
update public.owners set fee_mode='invoice' where id='e1000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.prepare_admin_digest() is null;
  perform public.admin_set_alert_digest(true,true);
  assert public.prepare_admin_digest() is not null;
end $$;

insert into public.admin_alert_queue (event_key,title,kind,dedupe_key)
 values ('test.email','Retry fixture','test','retry-fixture');
do $$
declare target uuid := (select id from public.admin_alert_queue where dedupe_key='retry-fixture');
  claimed public.admin_alert_queue;
begin
  for i in 1..3 loop
    select * into claimed from public.claim_admin_alert(target,'{}');
    assert claimed.attempts=i;
    assert public.finish_admin_alert(target,claimed.lease_token,'secret-provider-response');
    update public.admin_alert_queue set available_at=now() where id=target;
  end loop;
  assert exists(select 1 from public.admin_alert_queue where id=target and status='failed' and last_error='Email delivery failed');
  assert not exists(select 1 from public.sweep_admin_alerts() as ids(id) where id=target);
  assert exists(select 1 from public.notifications where type='admin_alert_failed' and channels='{in_app}');
  assert public.admin_retry_alert(target);
  assert exists(select 1 from public.admin_alert_queue where id=target and status='pending' and attempts=0);
end $$;

rollback;
