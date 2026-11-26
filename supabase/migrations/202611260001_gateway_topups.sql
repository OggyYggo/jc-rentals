create table public.gateway_topups (
  id uuid primary key default gen_random_uuid(),
  order_id text unique not null check (order_id ~ '^KBT-[A-Za-z0-9]{12}$'),
  owner_id uuid not null references public.owners(id),
  provider text not null default 'bayadgate',
  method text check (method in ('GCASH', 'MAYA', 'GOTYME')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired')),
  payment_url text,
  ledger_id uuid references public.owner_credit_ledger(id),
  callback_count int not null default 0,
  needs_review boolean not null default false,
  last_callback_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index gateway_topups_owner_created_idx on public.gateway_topups (owner_id, created_at desc);
alter table public.gateway_topups enable row level security;
revoke all on public.gateway_topups from public, anon, authenticated;
grant select on public.gateway_topups to authenticated;
grant select, insert, update, delete on public.gateway_topups to service_role;

create policy gateway_topups_owner_read on public.gateway_topups for select to authenticated
  using (exists (select 1 from public.owners o where o.id = owner_id and o.profile_id = (select auth.uid())));

create function public.create_gateway_topup(p_order_id text, p_owner_id uuid, p_amount numeric, p_method text)
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

  insert into public.gateway_topups (order_id, owner_id, amount, method)
  values (p_order_id, p_owner_id, p_amount, p_method);
  return true;
end;
$$;

create function public.review_gateway_callback(p_order_id text)
returns void language sql security definer set search_path = '' as $$
  update public.gateway_topups
  set callback_count = callback_count + 1,
      last_callback_at = clock_timestamp(),
      needs_review = true,
      status = case when status = 'created' and created_at <= clock_timestamp() - interval '2 hours'
                    then 'expired' else status end
  where order_id = p_order_id and status <> 'paid';
$$;

create function public.post_gateway_topup(p_order_id text, p_amount numeric)
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
  if topup.status = 'paid' then
    return 'already_paid';
  end if;
  if topup.status <> 'created' or topup.created_at <= clock_timestamp() - interval '2 hours' then
    raise exception 'Order is no longer open';
  end if;

  insert into public.owner_credit_ledger (owner_id, type, status, amount, reference_no, note)
  values (topup.owner_id, 'topup', 'posted', topup.amount, topup.order_id, 'Online top-up (BayadGate)')
  returning id into posted_id;

  update public.gateway_topups
  set status = 'paid', paid_at = clock_timestamp(), ledger_id = posted_id, needs_review = false,
      callback_count = callback_count + 1, last_callback_at = clock_timestamp()
  where id = topup.id;

  perform public.audit_write('topup.gateway_paid', 'topup', posted_id::text, topup.order_id,
    'BayadGate top-up posted', p_metadata => jsonb_build_object('owner_id', topup.owner_id, 'order_id', topup.order_id));

  select profile_id into owner_profile_id from public.owners where id = topup.owner_id;
  perform public.notify(owner_profile_id, 'topup_approved', 'Credits added',
    'Your online top-up was confirmed and added to your credits.', '/owner/credits',
    null, '{in_app,email,push}', false, 'gateway-topup:' || posted_id);
  return 'paid';
end;
$$;

revoke all on function public.create_gateway_topup(text, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.review_gateway_callback(text) from public, anon, authenticated;
revoke all on function public.post_gateway_topup(text, numeric) from public, anon, authenticated;
grant execute on function public.create_gateway_topup(text, uuid, numeric, text) to service_role;
grant execute on function public.review_gateway_callback(text) to service_role;
grant execute on function public.post_gateway_topup(text, numeric) to service_role;
