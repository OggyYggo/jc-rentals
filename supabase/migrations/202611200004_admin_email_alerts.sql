create table public.admin_alert_config (
  id boolean primary key default true check (id),
  recipients text[] not null default '{}' check (cardinality(recipients) <= 5),
  digest_enabled boolean not null default true,
  digest_even_if_empty boolean not null default false,
  last_digest_on date,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.admin_alert_config default values;

create table public.admin_alert_rules (
  event_key text primary key,
  label text not null,
  description text not null,
  mode text not null check (mode in ('instant','digest','off')),
  default_mode text not null check (default_mode in ('instant','digest')),
  locked boolean not null default false,
  check (not locked or mode <> 'off')
);
insert into public.admin_alert_rules (event_key,label,description,mode,default_mode,locked)
select event_key,label,description,mode,mode,event_key like 'security.%'
from (values
 ('application.submitted','New owner application','An application arrives for review.','instant'),
 ('topup.requested','Owner top-up to review','An owner submits a credit top-up.','instant'),
 ('plan.payment_submitted','Plan payment to review','An owner submits a plan payment.','instant'),
 ('contact.message','New contact message','A visitor submits the contact form.','instant'),
 ('owner.qr_submitted','Owner payment QR to verify','An owner uploads or replaces a payment QR.','digest'),
 ('customer.docs_submitted','Customer documents to review','A customer uploads identification.','digest'),
 ('security.commission_changed','Commission or fee terms changed','An owner’s commission, fee model, or deposit terms change.','instant'),
 ('security.owner_status_changed','Owner access or QR verification changed','An owner is activated, deactivated, or has a payment QR decision.','instant'),
 ('security.admin_role_changed','Admin access changed','Administrator access is granted or removed.','instant'),
 ('security.settings_changed','Platform settings changed','A platform setting is changed.','instant'),
 ('security.alert_recipient_changed','Alert recipients changed','The shared inbox settings are edited.','instant'),
 ('system.delivery_failures','Notification delivery problems','Five or more notification deliveries fail in an hour.','instant'),
 ('plan.expiring','Owner plans expiring','An active paid plan expires within seven days.','digest'),
 ('audit.exported','Audit log exported','An administrator downloads an audit export.','digest')
) as rules(event_key,label,description,mode);

create table public.admin_alert_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_key text not null,
  title text not null check (char_length(title) <= 140 and title !~ '[\r\n]'),
  body text check (char_length(body) <= 600),
  url text check (url is null or url ~ '^/admin(/[a-zA-Z0-9_-]+)*$'),
  dedupe_key text unique,
  status text not null default 'pending' check (status in ('pending','digest','sent','digested','failed')),
  attempts int not null default 0 check (attempts between 0 and 3),
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  recipient_snapshot text[],
  environment_only boolean not null default false,
  kind text not null default 'event' check (kind in ('event','old_recipients','test','daily')),
  requested_by uuid,
  digest_batch uuid,
  digest_on date,
  digest_data jsonb
);
create index admin_alert_queue_status_idx on public.admin_alert_queue (status, available_at, created_at);
create index admin_alert_queue_sent_idx on public.admin_alert_queue (sent_at) where status = 'sent' and kind = 'event';
create index admin_alert_queue_failed_idx on public.admin_alert_queue (failed_at) where status = 'failed';
create index admin_alert_queue_batch_idx on public.admin_alert_queue (digest_batch) where digest_batch is not null;
create index admin_alert_queue_test_idx on public.admin_alert_queue (requested_by, created_at) where kind = 'test';

alter table public.admin_alert_config enable row level security;
alter table public.admin_alert_rules enable row level security;
alter table public.admin_alert_queue enable row level security;
revoke all on public.admin_alert_config, public.admin_alert_rules, public.admin_alert_queue from public, anon, authenticated, service_role;
grant select on public.admin_alert_config, public.admin_alert_rules to authenticated;
grant select (id,created_at,event_key,title,status,attempts,sent_at,failed_at,last_error) on public.admin_alert_queue to authenticated;
grant select on public.admin_alert_config, public.admin_alert_queue to service_role;
create policy "Admins read alert config" on public.admin_alert_config for select to authenticated using ((select public.is_admin()));
create policy "Admins read alert rules" on public.admin_alert_rules for select to authenticated using ((select public.is_admin()));
create policy "Admins read alert queue" on public.admin_alert_queue for select to authenticated using ((select public.is_admin()));

create function public.admin_alert(p_event_key text, p_title text, p_body text default null, p_url text default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  delivery_mode text;
begin
  select mode into delivery_mode from public.admin_alert_rules where event_key = p_event_key;
  if delivery_mode is null or delivery_mode = 'off' then return; end if;
  insert into public.admin_alert_queue(event_key,title,body,url,dedupe_key,status)
  values (p_event_key,left(regexp_replace(p_title, '[\r\n]+',' ','g'),140),left(p_body,600),p_url,p_dedupe,
    case delivery_mode when 'instant' then 'pending' else 'digest' end)
  on conflict (dedupe_key) do nothing;
end;
$$;

create function public.admin_alert_mask(p_recipients text[])
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(left(address,1) || '***@' || split_part(address,'@',2) order by position),'{}')
  from unnest(p_recipients) with ordinality as addresses(address,position);
$$;

create function public.admin_set_alert_recipients(p_recipients text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  previous text[];
  new_recipients text[];
  old_label text;
  new_label text;
  reviewer text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_recipients is null or cardinality(p_recipients) not between 1 and 5 or exists (
    select 1 from unnest(p_recipients) as addresses(address)
    where address is null or char_length(btrim(address)) > 120
       or btrim(address) !~ '^[a-zA-Z0-9.!#$%&''*+/=?^_~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$'
  ) then raise exception 'Enter one to five valid email addresses.'; end if;
  select array_agg(distinct lower(btrim(address)) order by lower(btrim(address))) into new_recipients
    from unnest(p_recipients) as addresses(address);
  if cardinality(new_recipients) <> cardinality(p_recipients) then raise exception 'Email addresses must be unique.'; end if;
  select config.recipients into previous from public.admin_alert_config config where id for update;
  if previous = new_recipients then return previous; end if;

  old_label := coalesce(nullif(array_to_string(public.admin_alert_mask(previous), ', '), ''), 'Environment recipients');
  new_label := array_to_string(public.admin_alert_mask(new_recipients), ', ');
  select left(public.audit_safe_note(full_name),120) into reviewer from public.profiles where id=auth.uid();
  update public.admin_alert_config set recipients = new_recipients, updated_by=auth.uid(),updated_at=now() where id;
  perform public.audit_write('alert.recipients_updated','setting','admin_alert_recipients','Email alerts',
    'Admin alert recipients changed',jsonb_build_object('recipients',jsonb_build_object('from',old_label,'to',new_label)));

  -- Keep the previous destinations with their notice so retries cannot redirect it.
  insert into public.admin_alert_queue (event_key,title,body,url,kind,recipient_snapshot,environment_only)
    values ('security.alert_recipient_changed','Admin alert recipients changed',
      left('Changed by ' || coalesce(nullif(reviewer,''),'an administrator') || '. Sign in and review the audit log if this change was unexpected. New recipients: ' || new_label || '.',600),
      '/admin/audit-log','old_recipients',nullif(previous,'{}'),cardinality(previous)=0);
  perform public.admin_alert('security.alert_recipient_changed','Admin alert recipients changed',
    'Previous recipients: ' || old_label || '. New recipients: ' || new_label || '.', '/admin/audit-log');
  insert into public.admin_alert_queue(event_key,title,body,url,kind,recipient_snapshot)
    values ('test.email','Test email','This confirms the new Kuyog Bohol admin email alert destinations.','/admin/settings','test',new_recipients);
  perform public.notify_admins('admin_alert_recipients_changed','Admin alert recipients changed',
    'Review the recipient change in the audit log.','/admin/audit-log','{in_app}',true,null);
  return previous;
end;
$$;

create function public.admin_set_alert_rule(p_event_key text,p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rule public.admin_alert_rules;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into rule from public.admin_alert_rules where event_key=p_event_key for update;
  if not found or p_mode is null or p_mode not in ('instant','digest','off') then raise exception 'Invalid alert rule.'; end if;
  if rule.locked and p_mode='off' then raise exception 'Security alerts must stay on.'; end if;
  if rule.mode=p_mode then return; end if;
  update public.admin_alert_rules set mode=p_mode where event_key=p_event_key;
  perform public.audit_write('alert.rule_updated','setting',p_event_key,rule.label,'Email alert rule changed',
    jsonb_build_object('mode',jsonb_build_object('from',rule.mode,'to',p_mode)));
end;
$$;

create function public.admin_set_alert_digest(p_enabled boolean,p_even_if_empty boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  config public.admin_alert_config;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into config from public.admin_alert_config where id for update;
  if (config.digest_enabled,config.digest_even_if_empty) is not distinct from (p_enabled,p_even_if_empty) then return; end if;
  update public.admin_alert_config set digest_enabled=p_enabled,digest_even_if_empty=p_even_if_empty,
    updated_by=auth.uid(),updated_at=now() where id;
  perform public.audit_write('alert.digest_updated','setting','admin_alert_digest','Daily email summary','Daily email summary settings changed',
    jsonb_build_object('digest_enabled',jsonb_build_object('from',config.digest_enabled::text,'to',p_enabled::text),
    'digest_even_if_empty',jsonb_build_object('from',config.digest_even_if_empty::text,'to',p_even_if_empty::text)));
end;
$$;

create function public.admin_queue_test_alert()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  alert_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-alert-test:' || auth.uid(),0));
  if (select count(*) from public.admin_alert_queue where kind='test' and requested_by=auth.uid()
      and created_at > now()-interval '1 hour') >= 3 then
    raise exception 'You can send up to three test emails per hour.';
  end if;
  insert into public.admin_alert_queue(event_key,title,body,url,kind,requested_by)
    values ('test.email','Test email','This is a test of the Kuyog Bohol admin email alerts.','/admin/settings','test',auth.uid())
    returning id into alert_id;
  return alert_id;
end;
$$;

create function public.admin_retry_alert(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  update public.admin_alert_queue set status='pending',attempts=0,available_at=now(),last_error=null,failed_at=null
    where id=p_id and status='failed'
      and (kind <> 'daily' or digest_on = (now() at time zone 'Asia/Manila')::date);
  return found;
end;
$$;

revoke all on function public.admin_alert(text,text,text,text,text), public.admin_alert_mask(text[]),
  public.admin_set_alert_recipients(text[]), public.admin_set_alert_rule(text,text),public.admin_set_alert_digest(boolean,boolean),
  public.admin_queue_test_alert(),public.admin_retry_alert(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_alert(text,text,text,text,text) to service_role;
grant execute on function public.admin_set_alert_recipients(text[]),public.admin_set_alert_rule(text,text),
  public.admin_set_alert_digest(boolean,boolean),public.admin_queue_test_alert(),public.admin_retry_alert(uuid) to authenticated;
