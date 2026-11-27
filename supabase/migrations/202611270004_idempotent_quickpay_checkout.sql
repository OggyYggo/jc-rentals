alter table public.gateway_topups
  add column checkout_attempt_key uuid,
  add column checkout_lease_until timestamptz;

create unique index gateway_topup_checkout_attempt_idx
  on public.gateway_topups (owner_id, provider, livemode, checkout_attempt_key)
  where checkout_attempt_key is not null;

create function public.reserve_quickpay_checkout(
  p_order_id text, p_owner_id uuid, p_amount numeric, p_method text, p_livemode boolean, p_attempt_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.gateway_topups%rowtype;
  claimed_at timestamptz;
begin
  if p_attempt_key is null then raise exception 'Checkout attempt is required'; end if;
  perform 1 from public.owners where id = p_owner_id and is_active for update;
  if not found then raise exception 'Owner is inactive or missing'; end if;
  claimed_at := clock_timestamp();

  select * into existing from public.gateway_topups where owner_id = p_owner_id and provider = 'quickpay'
    and livemode = p_livemode and checkout_attempt_key = p_attempt_key for update;
  if found then
    if existing.amount is distinct from p_amount or existing.method is distinct from p_method then
      return jsonb_build_object('outcome', 'mismatch');
    end if;
    if existing.status <> 'created' or existing.ledger_id is not null or existing.needs_review
       or existing.created_at <= claimed_at - interval '55 minutes' then
      return jsonb_build_object('outcome', 'closed', 'orderId', existing.order_id);
    end if;
    if existing.payment_url is not null then
      return jsonb_build_object('outcome', 'ready', 'url', existing.payment_url, 'orderId', existing.order_id);
    end if;
    if existing.checkout_lease_until > claimed_at then
      return jsonb_build_object('outcome', 'in_progress', 'orderId', existing.order_id);
    end if;
    update public.gateway_topups set checkout_lease_until = claimed_at + interval '20 seconds'
      where id = existing.id;
    return jsonb_build_object('outcome', 'reserved', 'orderId', existing.order_id);
  end if;

  if (select count(*) from public.gateway_topups where owner_id = p_owner_id
      and created_at > claimed_at - interval '10 minutes') >= 5 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;
  insert into public.gateway_topups
    (order_id, owner_id, amount, method, provider, livemode, checkout_attempt_key, checkout_lease_until)
  values (p_order_id, p_owner_id, p_amount, p_method, 'quickpay', p_livemode, p_attempt_key, claimed_at + interval '20 seconds');
  return jsonb_build_object('outcome', 'reserved', 'orderId', p_order_id);
end;
$$;
revoke all on function public.reserve_quickpay_checkout(text, uuid, numeric, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.reserve_quickpay_checkout(text, uuid, numeric, text, boolean, uuid) to service_role;
