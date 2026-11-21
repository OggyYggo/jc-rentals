-- Invoices are monthly aggregates. Refresh open invoices from the same eligibility rules.
create function public.reconcile_cancelled_booking_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.platform_fee_charged or new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  update public.commission_invoices i
  set (total_bookings, gross_amount, commission_due) = (
    select count(*), coalesce(sum(case when b.status = 'cancelled' then b.cancel_fee_amount else b.total_price end), 0),
      coalesce(sum(b.commission_amount), 0)
    from public.bookings b
    where b.owner_id = i.owner_id and not b.platform_fee_charged
      and date_trunc('month', b.created_at at time zone 'Asia/Manila')::date = i.period_month
      and (b.status in ('confirmed','picked_up','returned','completed') or (b.status = 'cancelled' and b.cancel_fee_amount > 0))
  )
  where i.owner_id = new.owner_id and i.status = 'unpaid'
    and i.period_month = date_trunc('month', new.created_at at time zone 'Asia/Manila')::date;
  return new;
end;
$$;
revoke all on function public.reconcile_cancelled_booking_invoice() from public, anon, authenticated;
create trigger reconcile_cancelled_booking_invoice after update of status on public.bookings
for each row execute function public.reconcile_cancelled_booking_invoice();

create or replace function public.admin_generate_monthly_invoices(p_period_month date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  created_count integer;
  grace_days integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce((value #>> '{}')::integer, 7) into grace_days
  from public.settings where key = 'invoice_grace_days';
  grace_days := coalesce(grace_days, 7);
  lock table public.commission_invoices in share row exclusive mode;
  insert into public.commission_invoices (owner_id, period_month, total_bookings, gross_amount, commission_due, due_date)
  select b.owner_id, date_trunc('month', p_period_month)::date, count(*), sum(case when b.status = 'cancelled' then b.cancel_fee_amount else b.total_price end), sum(b.commission_amount),
         (date_trunc('month', p_period_month) + interval '1 month' + make_interval(days => grace_days))::date
  from public.bookings b join public.owners o on o.id = b.owner_id
  where o.fee_mode = 'invoice'
    and date_trunc('month', b.created_at at time zone 'Asia/Manila')::date = date_trunc('month', p_period_month)::date
    and not b.platform_fee_charged
    and (b.status in ('confirmed', 'picked_up', 'returned', 'completed') or (b.status = 'cancelled' and b.cancel_fee_amount > 0))
  group by b.owner_id
  on conflict (owner_id, period_month) do nothing;
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;
