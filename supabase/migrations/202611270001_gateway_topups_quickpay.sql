-- Adjusts gateway_topups for QuickPay and adds webhook de-duplication.
-- Run AFTER 202611260001_gateway_topups.sql. Safe to re-run.

alter table public.gateway_topups drop constraint if exists gateway_topups_method_check;
alter table public.gateway_topups alter column method drop not null;
alter table public.gateway_topups alter column provider set default 'quickpay';
alter table public.gateway_topups add column if not exists provider_checkout_id text;
alter table public.gateway_topups add column if not exists livemode boolean not null default false;
alter table public.gateway_topups drop constraint if exists gateway_topups_status_check;
alter table public.gateway_topups add constraint gateway_topups_status_check
  check (status in ('created', 'paid', 'failed', 'expired', 'needs_review'));
create unique index if not exists gateway_topups_provider_checkout_unique
  on public.gateway_topups (provider, provider_checkout_id) where provider_checkout_id is not null;

-- One row per webhook event so a resent event is never processed twice.
create table if not exists public.gateway_webhook_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  order_id text,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
alter table public.gateway_webhook_events enable row level security;
revoke all on public.gateway_webhook_events from public, anon, authenticated;
grant select on public.gateway_webhook_events to service_role;

-- Returns true if this event is new (and records it), false if it was already seen. Server only.
create or replace function public.record_gateway_event(p_provider text, p_event_id text, p_type text, p_order_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.gateway_webhook_events (provider, event_id, event_type, order_id)
  values (p_provider, p_event_id, p_type, p_order_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.record_gateway_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_gateway_event(text, text, text, text) to service_role;

-- Marks an unpaid order expired (checkout.expired). Server only.
create or replace function public.expire_gateway_topup(p_order_id text)
returns void language sql security definer set search_path = public as $$
  update public.gateway_topups set status = 'expired'
  where order_id = p_order_id and provider = 'quickpay' and status = 'created' and not needs_review;
$$;
revoke all on function public.expire_gateway_topup(text) from public, anon, authenticated;
grant execute on function public.expire_gateway_topup(text) to service_role;

drop function if exists public.create_gateway_topup(text, uuid, numeric, text);
drop function if exists public.review_gateway_callback(text);

create or replace function public.create_gateway_topup(p_order_id text, p_owner_id uuid, p_amount numeric, p_method text, p_livemode boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Lock the owner before counting so concurrent requests share the same limit.
  perform 1 from public.owners where id = p_owner_id and is_active for update;
  if not found then
    raise exception 'Owner is inactive or missing';
  end if;

  if (select count(*) from public.gateway_topups
      where owner_id = p_owner_id and created_at > clock_timestamp() - interval '10 minutes') >= 5 then
    return false;
  end if;

  insert into public.gateway_topups (order_id, owner_id, amount, method, provider, livemode)
  values (p_order_id, p_owner_id, p_amount, p_method, 'quickpay', p_livemode);
  return true;
end;
$$;

revoke all on function public.create_gateway_topup(text, uuid, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.create_gateway_topup(text, uuid, numeric, text, boolean) to service_role;

create or replace function public.post_gateway_topup(p_order_id text, p_amount numeric)
returns text language plpgsql security definer set search_path = '' as $$
declare
  topup public.gateway_topups%rowtype;
  posted_id uuid;
  owner_profile_id uuid;
begin
  select * into topup from public.gateway_topups where order_id = p_order_id for update;
  if not found or topup.amount is distinct from p_amount then
    raise exception 'Order or amount does not match';
  end if;
  if topup.status = 'paid' or topup.ledger_id is not null then
    return 'already_paid';
  end if;
  if topup.status <> 'created' or (topup.provider = 'bayadgate' and topup.created_at <= clock_timestamp() - interval '2 hours') then
    raise exception 'Order is no longer open';
  end if;

  insert into public.owner_credit_ledger (owner_id, type, status, amount, reference_no, note)
  values (topup.owner_id, 'topup', 'posted', topup.amount, topup.order_id, case when topup.provider = 'quickpay' then 'Online top-up (QuickPay)' else 'Online top-up (BayadGate)' end)
  returning id into posted_id;

  update public.gateway_topups
  set status = case when topup.provider = 'quickpay' and topup.needs_review then 'needs_review' else 'paid' end,
      paid_at = clock_timestamp(), ledger_id = posted_id,
      needs_review = topup.provider = 'quickpay' and topup.needs_review,
      callback_count = callback_count + 1, last_callback_at = clock_timestamp()
  where id = topup.id;

  perform public.audit_write('topup.gateway_paid', 'topup', posted_id::text, topup.order_id,
    'Online top-up posted', p_metadata => jsonb_build_object('owner_id', topup.owner_id, 'order_id', topup.order_id));

  select profile_id into owner_profile_id from public.owners where id = topup.owner_id;
  perform public.notify(owner_profile_id, 'topup_approved', 'Credits added',
    'Your online top-up was confirmed and added to your credits.', '/owner/credits',
    null, '{in_app,email,push}', false, 'gateway-topup:' || posted_id);
  return 'paid';
end;
$$;

-- The event ID and the money/status update commit together. Failed processing
-- rolls back the event claim so QuickPay can retry the same delivery.
create or replace function public.apply_quickpay_event(
  p_event_id text, p_type text, p_order_id text, p_action text,
  p_amount numeric, p_checkout_id text, p_livemode boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  topup public.gateway_topups%rowtype;
begin
  if not public.record_gateway_event('quickpay', p_event_id, p_type, p_order_id) then
    return;
  end if;
  select * into topup from public.gateway_topups
    where order_id = p_order_id and provider = 'quickpay' for update;
  if not found or topup.livemode is distinct from p_livemode then
    return;
  end if;
  if topup.provider_checkout_id is distinct from p_checkout_id then
    raise exception 'Checkout changed during verification';
  end if;

  if p_action = 'expire' then
    perform public.expire_gateway_topup(p_order_id);
  elsif p_action = 'post' and topup.ledger_id is not null then
    return;
  elsif p_action = 'post' and topup.status = 'created' then
    perform public.post_gateway_topup(p_order_id, p_amount);
  elsif p_action in ('post', 'review', 'extra') then
    update public.gateway_topups
    set needs_review = true,
        -- An extra payment can arrive before the original paid event.
        status = case when p_action = 'extra' and status = 'created' then status else 'needs_review' end
    where id = topup.id;
    if p_action = 'extra' then
      perform public.notify_admins('topup_extra_payment', 'Extra QuickPay payment',
        format('Check order %s in the QuickPay dashboard.', p_order_id),
        '/admin/topups', p_dedupe => 'quickpay-extra:' || p_event_id);
    end if;
  end if;
end;
$$;
revoke all on function public.apply_quickpay_event(text, text, text, text, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.apply_quickpay_event(text, text, text, text, numeric, text, boolean) to service_role;
