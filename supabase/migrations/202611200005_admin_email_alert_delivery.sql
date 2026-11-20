create function public.queue_admin_alert_from_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  alert_day text := (now() at time zone 'Asia/Manila')::date::text;
begin
  case tg_table_name
    when 'owner_credit_ledger' then
      if new.type='topup' and new.status='pending' then
        perform public.admin_alert('topup.requested','Owner top-up to review',null,'/admin/topups','topup.requested:' || new.id);
      end if;
    when 'plan_payments' then
      if new.status='pending' then
        perform public.admin_alert('plan.payment_submitted','Plan payment to review',null,'/admin/plan-payments','plan.payment_submitted:' || new.id);
      end if;
    when 'profiles' then
      if new.role='customer' and new.verification='pending' and
        ((new.license_path is not null and new.license_path is distinct from old.license_path) or
         (new.id_path is not null and new.id_path is distinct from old.id_path)) then
        perform public.admin_alert('customer.docs_submitted','Customer documents to review',null,'/admin/customers','customer.docs_submitted:' || new.id || ':' || alert_day);
      end if;
    when 'owners' then
      if new.payment_qr_path is not null and (tg_op='INSERT' or
         (new.payment_qr_path,new.payment_account_name,new.payment_method_label) is distinct from
         (old.payment_qr_path,old.payment_account_name,old.payment_method_label)) then
        perform public.admin_alert('owner.qr_submitted','Owner payment QR to verify',null,'/admin/owners','owner.qr_submitted:' || new.id || ':' || alert_day);
      end if;
    when 'audit_log' then
      if new.entity_type='owner' and new.action='owner.updated' then
        if new.changes ?| array['commission_rate','fee_mode','deposit_percent'] then
          perform public.admin_alert('security.commission_changed','Commission or fee terms changed',
            'Review the owner’s updated terms in the audit log.','/admin/audit-log','security.commission_changed:' || new.id);
        end if;
        if new.changes ?| array['is_active','payment_qr_verified'] then
          perform public.admin_alert('security.owner_status_changed','Owner access or QR verification changed',
            'Review the owner change in the audit log.','/admin/audit-log','security.owner_status_changed:' || new.id);
        end if;
      elsif new.entity_type='customer' and (new.changes->'role'->>'from'='admin' or new.changes->'role'->>'to'='admin') then
        perform public.admin_alert('security.admin_role_changed','Admin access changed',
          'Review the change in the audit log.','/admin/audit-log','security.admin_role_changed:' || new.id);
      elsif new.action in ('setting.updated','setting.created') then
        perform public.admin_alert('security.settings_changed','Platform settings changed',
          'Review the change in the audit log.','/admin/audit-log','security.settings_changed:' || new.id);
      elsif new.action='audit.exported' then
        perform public.admin_alert('audit.exported','Audit log exported',null,'/admin/audit-log','audit.exported:' || new.id);
      end if;
    else null;
  end case;
  return new;
exception when others then
  -- Alert queue failures must not roll back a business change or an audit entry.
  raise warning 'Could not enqueue an admin email alert (%).', sqlstate;
  return new;
end;
$$;

create trigger admin_alert_topup after insert on public.owner_credit_ledger
  for each row execute function public.queue_admin_alert_from_change();
create trigger admin_alert_plan_payment after insert on public.plan_payments
  for each row execute function public.queue_admin_alert_from_change();
create trigger admin_alert_customer_documents after update of license_path,id_path on public.profiles
  for each row execute function public.queue_admin_alert_from_change();
create trigger admin_alert_owner_qr after insert or update of payment_qr_path,payment_account_name,payment_method_label on public.owners
  for each row execute function public.queue_admin_alert_from_change();
create trigger admin_alert_audit after insert on public.audit_log
  for each row execute function public.queue_admin_alert_from_change();

-- Serialize capacity reservations, with a fenced lease for each provider attempt.
create function public.claim_admin_alert(p_id uuid,p_environment_recipients text[])
returns setof public.admin_alert_queue language plpgsql security definer set search_path = '' as $$
declare
  alert public.admin_alert_queue;
  destinations text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('admin-alert-dispatch',0));
  select * into alert from public.admin_alert_queue where id=p_id for update;
  if not found or alert.status <> 'pending' or alert.available_at > now() or alert.lease_until > now() then return; end if;
  if alert.kind='daily' and alert.digest_on < (now() at time zone 'Asia/Manila')::date then
    update public.admin_alert_queue set status='failed',failed_at=now(),last_error='Digest delivery window expired',
      lease_until=null,lease_token=null where id=p_id;
    return;
  end if;
  if alert.attempts >= 3 then
    update public.admin_alert_queue set status='failed',failed_at=now(),last_error='Delivery attempts exhausted',
      lease_until=null,lease_token=null where id=p_id;
    return;
  end if;
  if alert.kind='event' and (
    select count(*) from public.admin_alert_queue
    where kind='event' and ((status='sent' and sent_at > now()-interval '1 hour') or
       (status='pending' and lease_until > now()))
  ) >= 20 then
    if alert.attempts=0 then
      update public.admin_alert_queue set status='digest' where id=p_id;
    else
      update public.admin_alert_queue set available_at=now()+interval '5 minutes' where id=p_id;
    end if;
    return;
  end if;
  select coalesce(alert.recipient_snapshot,
      case when not alert.environment_only then nullif(config.recipients,'{}') end,
      p_environment_recipients,'{}')
    into destinations from public.admin_alert_config config where id;
  return query update public.admin_alert_queue set attempts=attempts+1,
    lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),
    recipient_snapshot=nullif(destinations,'{}')
    where id=p_id returning *;
end;
$$;

create function public.finish_admin_alert(p_id uuid,p_token uuid,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  alert public.admin_alert_queue;
begin
  update public.admin_alert_queue set
    status=case when p_error is null then 'sent' when attempts>=3 or p_error='No recipients configured' then 'failed' else 'pending' end,
    sent_at=case when p_error is null then now() end,
    failed_at=case when p_error is not null and (attempts>=3 or p_error='No recipients configured') then now() end,
    last_error=case when p_error is null then null when p_error in ('No recipients configured','Email sender is not configured',
      'Email provider rejected the request','Email provider is unavailable','Email request timed out') then p_error else 'Email delivery failed' end,
    lease_until=null,lease_token=null,available_at=now() + make_interval(mins => attempts * 2)
  where id=p_id and lease_token=p_token and status='pending'
  returning * into alert;
  if not found then return false; end if;
  if alert.kind='daily' and alert.status='sent' then
    update public.admin_alert_queue set status='digested',sent_at=now() where digest_batch=p_id and status='digest';
    update public.admin_alert_config set last_digest_on=greatest(last_digest_on,alert.digest_on) where id;
  end if;
  return true;
end;
$$;

create function public.notice_admin_alert_failure()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='failed' and old.status is distinct from new.status then
    perform public.notify_admins('admin_alert_failed','Admin email alert failed',
      'Check email delivery status in Settings.','/admin/settings','{in_app}',false,'admin-alert-failed:' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'Could not queue the admin in-app delivery notice (%).', sqlstate;
  return new;
end;
$$;
create trigger admin_alert_failure_notice after update of status on public.admin_alert_queue
  for each row execute function public.notice_admin_alert_failure();

alter table public.notifications add column admin_alert_failure_at timestamptz;
create index notifications_admin_alert_failure_idx on public.notifications (admin_alert_failure_at)
  where admin_alert_failure_at is not null;

create function public.note_notification_delivery_failure()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.admin_alert_failure_at := case when new.delivery_error is not null then now() else old.admin_alert_failure_at end;
  return new;
end;
$$;
create trigger note_notification_delivery_failure before update of delivery_error on public.notifications
  for each row execute function public.note_notification_delivery_failure();

create function public.sweep_admin_alerts()
returns setof uuid language plpgsql security definer set search_path = '' as $$
declare
  hour_key text := floor(extract(epoch from now()) / 3600)::text;
begin
  if (select count(*) from public.notifications
      where admin_alert_failure_at > now()-interval '1 hour') >= 5 then
    if exists (
      select 1 from public.admin_alert_queue failed
      where failed.status='failed' and failed.failed_at > now()-interval '1 hour'
        and not exists (select 1 from public.admin_alert_queue sent
          where sent.status='sent' and sent.sent_at > failed.failed_at)
    ) then
      perform public.notify_admins('notification_delivery_problems','Notification delivery problems',
        'Five or more per-user notifications had delivery problems in the past hour.',
        '/admin/settings','{in_app}',false,'system.delivery_failures:' || hour_key);
    else
      perform public.admin_alert('system.delivery_failures','Notification delivery problems',
        'Five or more per-user notifications had delivery problems in the past hour.',
        '/admin/settings','system.delivery_failures:' || hour_key);
    end if;
  end if;
  update public.admin_alert_queue set status='failed',failed_at=now(),
    last_error='Delivery window expired',lease_until=null,lease_token=null
    where status='pending' and available_at < now()-interval '24 hours' and coalesce(lease_until,'-infinity') <= now();
  return query select id from public.admin_alert_queue where status='pending' and available_at <= now()
    and coalesce(lease_until,'-infinity') <= now()
    order by available_at,created_at limit 50;
end;
$$;

revoke all on function public.queue_admin_alert_from_change(),public.claim_admin_alert(uuid,text[]),
  public.finish_admin_alert(uuid,uuid,text),public.notice_admin_alert_failure(),
  public.note_notification_delivery_failure(),public.sweep_admin_alerts()
from public, anon, authenticated, service_role;
grant execute on function public.claim_admin_alert(uuid,text[]),public.finish_admin_alert(uuid,uuid,text),public.sweep_admin_alerts() to service_role;
