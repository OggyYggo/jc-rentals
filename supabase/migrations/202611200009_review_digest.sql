create or replace function public.prepare_admin_digest()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  config public.admin_alert_config;
  manila_day date := (now() at time zone 'Asia/Manila')::date;
  midnight timestamptz := manila_day::timestamp at time zone 'Asia/Manila';
  yesterday timestamptz := (manila_day-1)::timestamp at time zone 'Asia/Manila';
  batch_id uuid;
  waiting jsonb;
  events jsonb;
  heads jsonb;
  activity jsonb;
  attention bigint;
begin
  select * into config from public.admin_alert_config where id for update;
  if config.last_digest_on >= manila_day then return null; end if;

  begin
    perform public.admin_alert('plan.expiring','Owner plans expiring','A paid owner plan expires within seven days.',
      '/admin/owners','plan.expiring:' || op.owner_id || ':' || extract(epoch from op.expires_at))
    from public.owner_plans op join public.plans p on p.id=op.plan_id
    where op.status='active' and p.code<>'starter' and op.expires_at between now() and now()+interval '7 days';
  exception when others then
    raise warning 'Could not enqueue plan expiry alerts (%).', sqlstate;
  end;

  if config.digest_enabled is not true then return null; end if;
  select id into batch_id from public.admin_alert_queue where dedupe_key='daily:' || manila_day;
  if found then return batch_id; end if;

  -- Release an undelivered prior day's events into today's digest.
  update public.admin_alert_queue entry set digest_batch=null
  from public.admin_alert_queue previous
  where entry.digest_batch=previous.id and entry.status='digest'
    and previous.kind='daily' and previous.digest_on < manila_day
    and coalesce(previous.lease_until,'-infinity') <= now() and previous.status <> 'sent';

  select coalesce(jsonb_agg(jsonb_build_object('label',label,'path',path,'count',total,'oldest',oldest) order by position),'[]'), coalesce(sum(total),0)
    into waiting,attention
  from (
    select 1 as position,'Owner applications' as label,'/admin/owner-applications' as path,count(*) as total,min(created_at) as oldest from public.owner_applications where status='pending'
    union all select 2,'Owner payment QRs','/admin/owners',count(*),min(coalesce(qr.created_at,o.created_at))
      from public.owners o left join lateral (
        select created_at from public.audit_log where entity_type='owner' and entity_id=o.id::text and changes ? 'payment_qr_path' order by id desc limit 1
      ) qr on true where o.payment_qr_path is not null and not o.payment_qr_verified and o.archived_at is null
    union all select 3,'Owner top-ups','/admin/topups',count(*),min(created_at) from public.owner_credit_ledger where type='topup' and status='pending'
    union all select 4,'Customer documents','/admin/customers',count(*),min(coalesce(docs.created_at,p.created_at))
      from public.profiles p left join lateral (
        select created_at from public.audit_log where entity_type='customer' and entity_id=p.id::text and changes ?| array['license_path','id_path'] order by id desc limit 1
      ) docs on true where p.role='customer' and p.verification='pending' and p.customer_archived_at is null
    union all select 5,'Booking payments','/admin/payments',count(*),min(paid_at) from public.payments where status='pending'
    union all select 6,'Plan payments','/admin/plan-payments',count(*),min(created_at) from public.plan_payments where status='pending'
    union all select 7,'Contact messages','/admin/contact-messages',count(*),min(created_at) from public.contact_messages where status='new'
    union all select 8,'Review reports','/admin/reviews',count(*),min(created_at) from public.review_reports where status='open'
  ) items where total>0;

  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',total) order by label),'[]') into heads from (
    select 'Paid plans expiring within seven days' as label,count(*) as total from public.owner_plans op join public.plans p on p.id=op.plan_id
      where op.status='active' and p.code<>'starter' and op.expires_at between now() and now()+interval '7 days'
    union all select 'Owners with low credits',count(*) from public.owners o
      left join public.owner_credit_balances b on b.owner_id=o.id
      where o.is_active and o.fee_mode='credits' and coalesce(b.balance,0) <
        coalesce((select (value #>> '{}')::numeric from public.settings where key='min_credit_to_list'),500)
    union all select 'Per-user notifications with delivery problems',count(*) from public.notifications where admin_alert_failure_at>now()-interval '1 day'
    union all select 'Admin email alerts that failed',count(*) from public.admin_alert_queue where status='failed' and failed_at>now()-interval '1 day'
  ) totals where total>0;

  select jsonb_build_object(
    'newBookings',count(*),
    'bookedValue',coalesce(sum(total_price) filter(where status in ('confirmed','picked_up','returned','completed')),0),
    'commission',coalesce(sum(commission_amount) filter(where status in ('confirmed','picked_up','returned','completed')),0),
    'confirmed',(select count(distinct entity_id) from public.audit_log where created_at>=yesterday and created_at<midnight
      and entity_type='booking' and changes->'status'->>'to'='confirmed'),
    'cancelled',(select count(distinct entity_id) from public.audit_log where created_at>=yesterday and created_at<midnight
      and entity_type='booking' and changes->'status'->>'to' in ('cancelled','expired')))
    into activity from public.bookings where created_at>=yesterday and created_at<midnight;

  batch_id := gen_random_uuid();
  update public.admin_alert_queue set digest_batch=batch_id where status='digest' and digest_batch is null;
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',total) order by label),'[]') into events
    from (select r.label,count(*) as total from public.admin_alert_queue q join public.admin_alert_rules r using(event_key)
      where q.digest_batch=batch_id group by r.label) grouped;

  if attention=0 and events='[]' and heads='[]' and not config.digest_even_if_empty then return null; end if;
  if attention=0 then
    select coalesce(sum((item->>'count')::bigint),0) into attention from jsonb_array_elements(heads || events) as items(item);
  end if;
  insert into public.admin_alert_queue(id,event_key,title,url,kind,dedupe_key,digest_on,digest_data)
    values (batch_id,'daily.summary',case when attention=0 then 'Daily summary: all caught up'
      else 'Daily summary: ' || attention || ' things need attention' end,'/admin','daily','daily:' || manila_day,manila_day,
      jsonb_build_object('waiting',waiting,'activity',activity,'events',events,'heads',heads));
  return batch_id;
end;
$$;
