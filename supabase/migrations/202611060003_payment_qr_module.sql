create extension if not exists btree_gist;

-- Owners configure a private payment QR. Changing any of these details
-- invalidates the previous verification.
alter table public.owners
  add column if not exists payment_method_label text,
  add column if not exists payment_account_name text,
  add column if not exists payment_qr_path text,
  add column if not exists payment_qr_verified boolean not null default false,
  add column if not exists fee_mode text not null default 'credits',
  add column if not exists deposit_percent numeric(4,3);

alter table public.owners drop constraint if exists owners_fee_mode_check;
alter table public.owners add constraint owners_fee_mode_check check (fee_mode in ('credits', 'invoice'));
alter table public.owners drop constraint if exists owners_deposit_percent_check;
alter table public.owners add constraint owners_deposit_percent_check check (deposit_percent is null or deposit_percent between 0.1 and 1);

alter table public.bookings
  add column if not exists payment_due_at timestamptz,
  add column if not exists amount_due_now numeric(10,2) not null default 0,
  add column if not exists amount_paid_online numeric(10,2) not null default 0,
  add column if not exists balance_at_pickup numeric(10,2) not null default 0,
  add column if not exists platform_fee_charged boolean not null default false,
  add column if not exists deposit_refund_status text not null default 'none';

alter table public.bookings drop constraint if exists bookings_deposit_refund_status_check;
alter table public.bookings add constraint bookings_deposit_refund_status_check
  check (deposit_refund_status in ('none', 'owed', 'refunded'));
alter table public.bookings alter column status set default 'awaiting_payment';

-- Existing unapproved requests become payment requests and receive a fresh
-- payment window. Historical confirmed and completed bookings are preserved.
update public.bookings
set status = 'awaiting_payment',
    payment_due_at = coalesce(payment_due_at, now() + interval '24 hours')
where status = 'pending';

-- Hold dates while a deposit is awaiting review, and release them after expiry,
-- cancellation, or rejection.
alter table public.bookings drop constraint if exists no_double_booking;
do $$ begin
  if exists (
    select 1 from public.bookings a
    join public.bookings b on b.car_id = a.car_id and b.id > a.id and b.during && a.during
    where a.status in ('awaiting_payment', 'payment_review', 'confirmed', 'picked_up')
      and b.status in ('awaiting_payment', 'payment_review', 'confirmed', 'picked_up')
  ) then
    raise exception 'Cannot add no_double_booking: active bookings overlap. Resolve overlapping reservations and rerun this migration.';
  end if;
end $$;
alter table public.bookings add constraint no_double_booking exclude using gist (
  car_id with =,
  during with &&
) where (status in ('awaiting_payment', 'payment_review', 'confirmed', 'picked_up'));

do $$ begin
  create type public.payment_proof_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

alter table public.payments
  add column if not exists status public.payment_proof_status not null default 'pending',
  add column if not exists reference_no text,
  add column if not exists proof_path text,
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

-- Old payment rows were manually recorded by owners and represent completed
-- collections. Preserve them as verified records.
update public.payments set status = 'verified', verified_at = coalesce(verified_at, paid_at)
where status = 'pending' and proof_path is null;

drop index if exists public.payments_reference_unique;
create unique index payments_reference_unique on public.payments (reference_no)
  where reference_no is not null;

create table if not exists public.owner_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  type text not null check (type in ('topup', 'booking_fee', 'fee_refund', 'adjustment')),
  amount numeric(10,2) not null,
  status text not null default 'posted' check (status in ('pending', 'posted', 'rejected')),
  booking_id uuid references public.bookings(id),
  reference_no text,
  proof_path text,
  note text,
  created_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.owner_credit_ledger add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.owner_credit_ledger add column if not exists reviewed_at timestamptz;
create index if not exists owner_credit_ledger_owner_idx on public.owner_credit_ledger (owner_id, created_at desc);
create unique index if not exists ledger_one_fee_per_booking
  on public.owner_credit_ledger (booking_id) where type = 'booking_fee';
create unique index if not exists ledger_one_refund_per_booking
  on public.owner_credit_ledger (booking_id) where type = 'fee_refund';
create unique index if not exists ledger_topup_reference_unique
  on public.owner_credit_ledger (reference_no)
  where type = 'topup' and reference_no is not null and status <> 'rejected';

alter table public.commission_invoices add column if not exists due_date date;
alter table public.commission_invoices add column if not exists reference_no text;
alter table public.commission_invoices add column if not exists proof_path text;

insert into public.settings (key, value) values
  ('deposit_percent', '0.30'::jsonb),
  ('payment_window_hours', '24'::jsonb),
  ('min_credit_to_list', '500'::jsonb),
  ('invoice_grace_days', '7'::jsonb),
  ('platform_account_name', '""'::jsonb),
  ('platform_qr_path', '""'::jsonb),
  ('payment_instructions', '"Scan the QR, enter the exact amount, and put your booking reference in the message."'::jsonb)
on conflict (key) do nothing;

create or replace view public.owner_credit_balances
with (security_invoker = true)
as
select o.id as owner_id,
       o.business_name,
       coalesce(sum(l.amount) filter (where l.status = 'posted'), 0) as balance
from public.owners o
left join public.owner_credit_ledger l on l.owner_id = o.id
group by o.id, o.business_name;

create or replace view public.owner_payment_settings
with (security_barrier = true)
as
select key, value from public.settings
where key in ('platform_account_name', 'platform_qr_path', 'payment_instructions');
grant select on public.owner_payment_settings to authenticated;

create or replace function public.owner_can_accept(p_owner_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(o.is_active and o.payment_qr_verified and case o.fee_mode
    when 'credits' then
      coalesce((select sum(l.amount) from public.owner_credit_ledger l
                where l.owner_id = o.id and l.status = 'posted'), 0)
        >= coalesce((select (s.value #>> '{}')::numeric from public.settings s where s.key = 'min_credit_to_list'), 500)
    else
      not exists (select 1 from public.commission_invoices i
                  where i.owner_id = o.id and i.status = 'unpaid'
                    and i.due_date is not null and i.due_date < current_date)
    end, false)
  from public.owners o where o.id = p_owner_id
$$;
revoke all on function public.owner_can_accept(uuid) from public;
grant execute on function public.owner_can_accept(uuid) to anon, authenticated;

-- Public car cards/details are shown only for businesses currently allowed to
-- accept bookings. Owners and admins retain their own management policies.
drop policy if exists "Anyone can read active cars" on public.cars;
create policy "Anyone can read active cars" on public.cars
  for select using (is_active and public.owner_can_accept(owner_id));

create or replace function public.reset_owner_payment_qr_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payment_method_label is distinct from old.payment_method_label
     or new.payment_account_name is distinct from old.payment_account_name
     or new.payment_qr_path is distinct from old.payment_qr_path then
    new.payment_qr_verified := false;
  end if;

  if not public.is_admin() and auth.uid() = old.profile_id then
    if new.business_name is distinct from old.business_name
       or new.contact_phone is distinct from old.contact_phone
       or new.commission_rate is distinct from old.commission_rate
       or new.is_active is distinct from old.is_active
       or new.fee_mode is distinct from old.fee_mode
       or new.deposit_percent is distinct from old.deposit_percent
       or new.payment_qr_verified is distinct from old.payment_qr_verified then
      raise exception 'Only administrators can change business access, fees, deposit percent, and QR verification.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_owner_payment_qr_verification on public.owners;
create trigger reset_owner_payment_qr_verification
before update on public.owners
for each row execute procedure public.reset_owner_payment_qr_verification();

drop policy if exists "Owners can update own payment settings" on public.owners;
create policy "Owners can update own payment settings" on public.owners
  for update to authenticated using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
grant update (payment_method_label, payment_account_name, payment_qr_path) on public.owners to authenticated;

create or replace function public.set_booking_owner_and_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  booking_rate numeric(10,2);
  booking_deposit numeric(10,2);
  booking_commission numeric(5,4);
  owner_uuid uuid;
  deposit_fraction numeric(4,3);
  window_hours numeric;
begin
  select c.owner_id, o.commission_rate, r.daily_rate, r.deposit_amount, o.deposit_percent
  into owner_uuid, booking_commission, booking_rate, booking_deposit, deposit_fraction
  from public.cars c
  join public.owners o on o.id = c.owner_id
  join public.car_rates r on r.car_id = c.id and r.mode = new.mode
  where c.id = new.car_id and c.is_active
    and ((new.mode = 'self_drive' and c.allows_self_drive) or (new.mode = 'with_driver' and c.allows_with_driver));

  if not found or not public.owner_can_accept(owner_uuid) then
    raise exception 'This car is unavailable for bookings. Please choose another listing.';
  end if;
  if new.end_date < new.start_date then raise exception 'End date must be on or after start date.'; end if;

  if exists (
    select 1 from public.car_blocked_dates d
    where d.car_id = new.car_id
      and daterange(d.start_date, d.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then raise exception 'This car is blocked for one or more selected dates.'; end if;

  select coalesce((s.value #>> '{}')::numeric, 0.30) into window_hours
  from public.settings s where s.key = 'payment_window_hours';
  window_hours := coalesce(window_hours, 24);
  if window_hours < 1 or window_hours > 168 then window_hours := 24; end if;
  select coalesce(deposit_fraction, (s.value #>> '{}')::numeric, 0.30) into deposit_fraction
  from public.settings s where s.key = 'deposit_percent';
  deposit_fraction := greatest(0.1, least(1, coalesce(deposit_fraction, 0.30)));

  new.owner_id := owner_uuid;
  new.days := greatest(1, new.end_date - new.start_date);
  new.daily_rate := booking_rate;
  new.total_price := booking_rate * new.days;
  new.deposit_amount := case when new.mode = 'self_drive' then booking_deposit else 0 end;
  new.commission_rate := booking_commission;
  new.commission_amount := round(new.total_price * booking_commission, 2);
  new.owner_earnings := new.total_price - new.commission_amount;
  new.amount_due_now := round(new.total_price * deposit_fraction, 2);
  new.balance_at_pickup := new.total_price - new.amount_due_now;
  new.payment_due_at := now() + make_interval(hours => window_hours::integer);
  new.status := 'awaiting_payment';
  new.payment := case when new.amount_due_now >= new.total_price then 'paid'::public.payment_status else 'unpaid'::public.payment_status end;
  return new;
end;
$$;

drop trigger if exists assign_booking_owner_and_earnings on public.bookings;
create trigger assign_booking_owner_and_earnings
before insert on public.bookings
for each row execute procedure public.set_booking_owner_and_earnings();

drop policy if exists "Customers can create own booking requests" on public.bookings;
create policy "Customers can create own booking requests" on public.bookings
  for insert to authenticated with check (
    customer_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'customer')
    and status = 'awaiting_payment'
    and start_date >= (now() at time zone 'Asia/Manila')::date
    and end_date >= start_date
    and ((mode = 'with_driver' and nullif(trim(pickup_location), '') is not null
          and pickup_time is not null and nullif(trim(itinerary_notes), '') is not null)
      or (mode = 'self_drive' and pickup_time is null and exists (
        select 1 from public.profiles p where p.id = (select auth.uid())
          and nullif(trim(p.license_path), '') is not null
          and nullif(trim(p.id_path), '') is not null
          and p.verification in ('pending', 'approved')
      )))
  );
grant insert (car_id, customer_id, mode, start_date, end_date, pickup_time, pickup_location, itinerary_notes)
  on public.bookings to authenticated;

create or replace view public.public_car_booking_dates
with (security_barrier = true)
as
select b.car_id, b.start_date, b.end_date
from public.bookings b join public.cars c on c.id = b.car_id and c.is_active
where b.status in ('awaiting_payment', 'payment_review', 'confirmed', 'picked_up');
grant select on public.public_car_booking_dates to anon, authenticated;

create or replace function public.prevent_booking_date_block_conflict()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.bookings b
    where b.car_id = new.car_id
      and b.status in ('awaiting_payment', 'payment_review', 'confirmed', 'picked_up')
      and daterange(b.start_date, b.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then raise exception 'These dates overlap an active booking.'; end if;
  return new;
end;
$$;

create or replace function public.validate_customer_payment_proof()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  booking_row public.bookings%rowtype;
begin
  select * into booking_row from public.bookings where id = new.booking_id for update;
  if not found then raise exception 'Booking not found.'; end if;

  if new.status = 'verified' then
    if not public.is_admin() and not exists (
      select 1 from public.owners o where o.id = booking_row.owner_id and o.profile_id = auth.uid()
    ) then raise exception 'Only the owner or an administrator can record a verified payment.'; end if;
    return new;
  end if;

  if booking_row.customer_id <> auth.uid() then raise exception 'This booking does not belong to you.'; end if;
  if booking_row.status not in ('awaiting_payment', 'payment_review') then raise exception 'This booking is not accepting payment proofs.'; end if;
  if booking_row.payment_due_at is not null and booking_row.payment_due_at <= now() then raise exception 'The payment window has expired.'; end if;
  if new.amount <> booking_row.amount_due_now then raise exception 'Enter the exact deposit amount shown on the pay page.'; end if;
  if nullif(trim(new.reference_no), '') is null then raise exception 'Transaction reference is required.'; end if;
  if new.proof_path is null or new.proof_path not like auth.uid()::text || '/' || new.booking_id::text || '/%' then raise exception 'Invalid proof file path.'; end if;
  new.status := 'pending';
  new.verified_by := null;
  new.verified_at := null;
  new.rejection_reason := null;
  return new;
end;
$$;

create or replace function public.move_booking_to_payment_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    update public.bookings set status = 'payment_review' where id = new.booking_id;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_customer_payment_proof on public.payments;
create trigger validate_customer_payment_proof before insert on public.payments
for each row execute procedure public.validate_customer_payment_proof();
drop trigger if exists move_booking_to_payment_review on public.payments;
create trigger move_booking_to_payment_review after insert on public.payments
for each row execute procedure public.move_booking_to_payment_review();

create or replace function public.confirm_booking_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  payment_row public.payments%rowtype;
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
  credit_balance numeric;
begin
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found or payment_row.status <> 'pending' then raise exception 'Payment not found or already processed.'; end if;
  select * into booking_row from public.bookings where id = payment_row.booking_id for update;
  select * into owner_row from public.owners where id = booking_row.owner_id for update;
  if not (owner_row.profile_id = auth.uid() or public.is_admin()) then raise exception 'Not allowed.'; end if;
  if booking_row.status <> 'payment_review' then raise exception 'Booking is not waiting for payment review.'; end if;
  if booking_row.payment_due_at <= now() then raise exception 'The payment deadline has passed.'; end if;

  if owner_row.fee_mode = 'credits' then
    select coalesce(sum(l.amount), 0) into credit_balance
    from public.owner_credit_ledger l where l.owner_id = owner_row.id and l.status = 'posted';
    if credit_balance < booking_row.commission_amount then
      raise exception 'Not enough credits to cover the platform fee. Please top up first.';
    end if;
    insert into public.owner_credit_ledger (owner_id, type, amount, booking_id, status, note, created_by)
    values (owner_row.id, 'booking_fee', -booking_row.commission_amount, booking_row.id,
            'posted', 'Platform fee for ' || booking_row.reference, auth.uid());
  end if;

  update public.payments set status = 'verified', verified_by = auth.uid(), verified_at = now()
  where id = p_payment_id;
  update public.bookings set status = 'confirmed', amount_paid_online = payment_row.amount,
    payment = case when payment_row.amount >= total_price then 'paid'::public.payment_status else 'partial'::public.payment_status end,
    platform_fee_charged = (owner_row.fee_mode = 'credits')
  where id = booking_row.id;
end;
$$;

create or replace function public.reject_booking_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  payment_row public.payments%rowtype;
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found or payment_row.status <> 'pending' then raise exception 'Payment not found or already processed.'; end if;
  select * into booking_row from public.bookings where id = payment_row.booking_id for update;
  select * into owner_row from public.owners where id = booking_row.owner_id;
  if not (owner_row.profile_id = auth.uid() or public.is_admin()) then raise exception 'Not allowed.'; end if;
  if booking_row.status <> 'payment_review' then raise exception 'Booking is not waiting for payment review.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Provide a reason for rejecting this proof.'; end if;
  update public.payments set status = 'rejected', rejection_reason = trim(p_reason) where id = p_payment_id;
  update public.bookings set status = case when payment_due_at <= now() then 'expired'::public.booking_status else 'awaiting_payment'::public.booking_status end,
    deposit_refund_status = case when payment_due_at <= now() then 'owed' else deposit_refund_status end
  where id = booking_row.id;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
  select * into booking_row from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  select * into owner_row from public.owners where id = booking_row.owner_id;
  if not (booking_row.customer_id = auth.uid() or owner_row.profile_id = auth.uid() or public.is_admin()) then
    raise exception 'Not allowed.';
  end if;
  if booking_row.status not in ('awaiting_payment', 'payment_review', 'confirmed') then
    raise exception 'This booking can no longer be cancelled.';
  end if;
  if booking_row.customer_id = auth.uid() and booking_row.start_date <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'Customers can only cancel before the rental starts.';
  end if;

  if booking_row.platform_fee_charged then
    insert into public.owner_credit_ledger (owner_id, type, amount, booking_id, status, note, created_by)
    values (owner_row.id, 'fee_refund', booking_row.commission_amount, booking_row.id,
            'posted', 'Fee refunded because booking was cancelled.', auth.uid());
  end if;
  update public.payments set status = 'rejected', rejection_reason = 'Booking cancelled; refund any received transfer to the customer.'
    where booking_id = booking_row.id and status = 'pending';
  update public.bookings set status = 'cancelled', cancel_reason = left(trim(coalesce(p_reason, 'Cancelled')), 500),
    platform_fee_charged = false,
    deposit_refund_status = case when amount_paid_online > 0 or exists (
      select 1 from public.payments p where p.booking_id = booking_row.id and p.status = 'verified'
    ) or exists (
      select 1 from public.payments p where p.booking_id = booking_row.id and p.status = 'rejected'
        and p.rejection_reason = 'Booking cancelled; refund any received transfer to the customer.'
    ) then 'owed' else 'none' end
  where id = booking_row.id;
end;
$$;

create or replace function public.mark_deposit_refunded(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
  select * into booking_row from public.bookings where id = p_booking_id for update;
  if not found or booking_row.status not in ('cancelled', 'expired') or booking_row.deposit_refund_status <> 'owed' then
    raise exception 'This booking has no deposit refund waiting to be marked.';
  end if;
  select * into owner_row from public.owners where id = booking_row.owner_id;
  if not (owner_row.profile_id = auth.uid() or public.is_admin()) then raise exception 'Not allowed.'; end if;
  update public.bookings set deposit_refund_status = 'refunded', payment = 'refunded' where id = p_booking_id;
end;
$$;

create or replace function public.owner_set_booking_status(booking_uuid uuid, next_status public.booking_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_status public.booking_status;
  current_payment public.payment_status;
begin
  select b.status, b.payment into current_status, current_payment
  from public.bookings b join public.owners o on o.id = b.owner_id
  where b.id = booking_uuid and (o.profile_id = auth.uid() or public.is_admin()) and o.is_active
  for update of b;
  if not found then raise exception 'Booking not found for this owner.'; end if;
  if not ((current_status = 'confirmed' and next_status = 'picked_up' and current_payment = 'paid')
       or (current_status = 'picked_up' and next_status = 'returned')
       or (current_status = 'returned' and next_status = 'completed')) then
    raise exception 'This booking status change is not allowed. Record the pickup balance before marking it picked up.';
  end if;
  update public.bookings set status = next_status where id = booking_uuid;
end;
$$;

create or replace function public.owner_mark_payment_received(booking_uuid uuid, payment_method text default 'cash')
returns void language plpgsql security definer set search_path = '' as $$
declare
  booking_row public.bookings%rowtype;
begin
  select b.* into booking_row
  from public.bookings b join public.owners o on o.id = b.owner_id
  where b.id = booking_uuid and o.profile_id = auth.uid() and o.is_active
    and b.status in ('confirmed', 'picked_up') for update of b;
  if not found then raise exception 'Payment cannot be recorded for this booking.'; end if;
  if booking_row.payment = 'paid' then return; end if;
  if coalesce(payment_method, 'cash') not in ('cash', 'gcash', 'bank_transfer', 'other') then raise exception 'Payment method is not supported.'; end if;
  if booking_row.balance_at_pickup > 0 then
    insert into public.payments (booking_id, amount, method, status, verified_by, verified_at)
    values (booking_uuid, booking_row.balance_at_pickup, coalesce(nullif(payment_method, ''), 'cash'), 'verified', auth.uid(), now());
  end if;
  update public.bookings set payment = 'paid' where id = booking_uuid;
end;
$$;

create or replace function public.admin_review_owner_topup(p_ledger_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ledger_row public.owner_credit_ledger%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into ledger_row from public.owner_credit_ledger where id = p_ledger_id for update;
  if not found or ledger_row.type <> 'topup' or ledger_row.status <> 'pending' then raise exception 'Pending top-up not found.'; end if;
  update public.owner_credit_ledger set status = case when p_approve then 'posted' else 'rejected' end,
    note = case when p_approve then 'Top-up verified.' else left(trim(coalesce(p_reason, 'Top-up proof rejected.')), 500) end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_ledger_id;
end;
$$;

create or replace function public.admin_set_owner_payment_terms(
  p_owner_id uuid, p_fee_mode text, p_commission_rate numeric, p_deposit_percent numeric
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_fee_mode not in ('credits', 'invoice') then raise exception 'Invalid fee model.'; end if;
  if p_commission_rate < 0 or p_commission_rate > 1 then raise exception 'Commission must be between 0 and 100 percent.'; end if;
  if p_deposit_percent is not null and (p_deposit_percent < 0.1 or p_deposit_percent > 1) then raise exception 'Deposit percent must be between 10 and 100 percent.'; end if;
  update public.owners set fee_mode = p_fee_mode, commission_rate = p_commission_rate,
    deposit_percent = p_deposit_percent where id = p_owner_id;
  if not found then raise exception 'Owner not found.'; end if;
end;
$$;

create or replace function public.admin_set_owner_payment_qr_verified(p_owner_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  update public.owners set payment_qr_verified = p_verified
  where id = p_owner_id and (not p_verified or (payment_method_label is not null and payment_account_name is not null and payment_qr_path is not null));
  if not found then raise exception 'Owner QR setup is incomplete or owner was not found.'; end if;
end;
$$;

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
  insert into public.commission_invoices (owner_id, period_month, total_bookings, gross_amount, commission_due, due_date)
  select b.owner_id, date_trunc('month', p_period_month)::date, count(*), sum(b.total_price), sum(b.commission_amount),
         (date_trunc('month', p_period_month) + interval '1 month' + make_interval(days => grace_days))::date
  from public.bookings b join public.owners o on o.id = b.owner_id
  where o.fee_mode = 'invoice'
    and date_trunc('month', b.created_at)::date = date_trunc('month', p_period_month)::date
    and b.status in ('confirmed', 'picked_up', 'returned', 'completed')
  group by b.owner_id
  on conflict (owner_id, period_month) do nothing;
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;

create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  update public.commission_invoices set status = 'paid', paid_at = now()
  where id = p_invoice_id and status = 'unpaid';
  if not found then raise exception 'Unpaid invoice not found.'; end if;
end;
$$;

revoke all on function public.confirm_booking_payment(uuid) from public;
revoke all on function public.cancel_my_booking(uuid) from public, anon, authenticated;
revoke all on function public.reject_booking_payment(uuid, text) from public;
revoke all on function public.cancel_booking(uuid, text) from public;
revoke all on function public.mark_deposit_refunded(uuid) from public;
revoke all on function public.owner_set_booking_status(uuid, public.booking_status) from public;
revoke all on function public.owner_mark_payment_received(uuid, text) from public;
revoke all on function public.admin_review_owner_topup(uuid, boolean, text) from public;
revoke all on function public.admin_set_owner_payment_terms(uuid, text, numeric, numeric) from public;
revoke all on function public.admin_set_owner_payment_qr_verified(uuid, boolean) from public;
revoke all on function public.admin_generate_monthly_invoices(date) from public;
revoke all on function public.admin_mark_invoice_paid(uuid) from public;
grant execute on function public.confirm_booking_payment(uuid) to authenticated;
grant execute on function public.reject_booking_payment(uuid, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.mark_deposit_refunded(uuid) to authenticated;
grant execute on function public.owner_set_booking_status(uuid, public.booking_status) to authenticated;
grant execute on function public.owner_mark_payment_received(uuid, text) to authenticated;
grant execute on function public.admin_review_owner_topup(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_owner_payment_terms(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.admin_set_owner_payment_qr_verified(uuid, boolean) to authenticated;
grant execute on function public.admin_generate_monthly_invoices(date) to authenticated;
grant execute on function public.admin_mark_invoice_paid(uuid) to authenticated;

create or replace function public.expire_unpaid_bookings()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.payments set status = 'rejected',
    rejection_reason = 'Payment window expired; reconcile any received transfer and refund it to the customer.'
  where status = 'pending' and booking_id in (
    select id from public.bookings where status = 'payment_review' and payment_due_at <= now()
  );
  update public.bookings set status = 'expired',
    deposit_refund_status = case when status = 'payment_review' then 'owed' else deposit_refund_status end
  where status in ('awaiting_payment', 'payment_review') and payment_due_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.expire_unpaid_bookings() from public, anon, authenticated;

-- Supabase projects with pg_cron enabled get automatic ten-minute expiry.
-- If pg_cron is unavailable, the function remains callable by a trusted scheduler.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (select 1 from cron.job where jobname = 'expire-unpaid-bookings') then
      perform cron.schedule('expire-unpaid-bookings', '*/10 * * * *', 'select public.expire_unpaid_bookings()');
    end if;
  end if;
exception when undefined_table or undefined_function then null;
end $$;

-- RLS and least-privilege writes for the customer proof, owner verification,
-- and platform-credit ledgers.
alter table public.payments enable row level security;
drop policy if exists "Customers can read own payments" on public.payments;
create policy "Customers can read own payments" on public.payments for select to authenticated
  using (booking_id in (select b.id from public.bookings b where b.customer_id = (select auth.uid())));
drop policy if exists "Owners can read payments for own bookings" on public.payments;
create policy "Owners can read payments for own bookings" on public.payments for select to authenticated
  using (booking_id in (select b.id from public.bookings b join public.owners o on o.id = b.owner_id where o.profile_id = (select auth.uid())));
drop policy if exists "Admins can read all payments" on public.payments;
drop policy if exists "Admins can manage payments" on public.payments;
create policy "Admins can manage payments" on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Customers can add own payment proof" on public.payments;
create policy "Customers can add own payment proof" on public.payments for insert to authenticated
  with check (status = 'pending' and booking_id in (
    select b.id from public.bookings b where b.customer_id = (select auth.uid())
      and b.status in ('awaiting_payment', 'payment_review')
  ));
grant select on public.payments to authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;
grant insert (booking_id, amount, method, reference_no, proof_path) on public.payments to authenticated;

-- Restore least-privilege writes with RLS and a trigger that rejects owner or
-- customer attempts to write payment verification state directly.
alter table public.owner_credit_ledger enable row level security;
drop policy if exists "Owners read own credit ledger" on public.owner_credit_ledger;
create policy "Owners read own credit ledger" on public.owner_credit_ledger for select to authenticated
  using (owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid())));
drop policy if exists "Owners request credit topups" on public.owner_credit_ledger;
create policy "Owners request credit topups" on public.owner_credit_ledger for insert to authenticated
  with check (type = 'topup' and status = 'pending' and amount > 0 and booking_id is null
    and owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid())));
drop policy if exists "Admins manage credit ledger" on public.owner_credit_ledger;
create policy "Admins manage credit ledger" on public.owner_credit_ledger for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.owner_credit_ledger to authenticated;
grant select on public.owner_credit_balances to authenticated;

-- Payment verification and deletion stay behind security-definer procedures.

-- Private image buckets. QR, deposit proofs, and top-up proofs never have public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('owner-qr', 'owner-qr', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('topup-proofs', 'topup-proofs', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('platform-qr', 'platform-qr', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers upload own payment proofs" on storage.objects;
create policy "Customers upload own payment proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.bookings b where b.id::text = (storage.foldername(name))[2]
      and b.customer_id = (select auth.uid()) and b.status in ('awaiting_payment', 'payment_review')));
drop policy if exists "Customers read own payment proofs" on storage.objects;
create policy "Customers read own payment proofs" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners read payment proofs for own bookings" on storage.objects;
create policy "Owners read payment proofs for own bookings" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and exists (
    select 1 from public.bookings b join public.owners o on o.id = b.owner_id
    where b.id::text = (storage.foldername(name))[2] and o.profile_id = (select auth.uid())));
drop policy if exists "Admins read payment proofs" on storage.objects;
create policy "Admins read payment proofs" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

drop policy if exists "Owners upload own QR" on storage.objects;
create policy "Owners upload own QR" on storage.objects for insert to authenticated
  with check (bucket_id = 'owner-qr' and (storage.foldername(name))[1] in (
    select o.id::text from public.owners o where o.profile_id = (select auth.uid())));
drop policy if exists "Owners read own QR" on storage.objects;
create policy "Owners read own QR" on storage.objects for select to authenticated
  using (bucket_id = 'owner-qr' and (storage.foldername(name))[1] in (
    select o.id::text from public.owners o where o.profile_id = (select auth.uid())));
drop policy if exists "Admins read owner QR" on storage.objects;
create policy "Admins read owner QR" on storage.objects for select to authenticated
  using (bucket_id = 'owner-qr' and public.is_admin());
drop policy if exists "Admins upload platform QR" on storage.objects;
create policy "Admins upload platform QR" on storage.objects for all to authenticated
  using (bucket_id = 'platform-qr' and public.is_admin()) with check (bucket_id = 'platform-qr' and public.is_admin());
drop policy if exists "Owners read platform QR" on storage.objects;
create policy "Owners read platform QR" on storage.objects for select to authenticated
  using (bucket_id = 'platform-qr' and (select p.role from public.profiles p where p.id = (select auth.uid())) = 'owner');

drop policy if exists "Owners upload own topup proofs" on storage.objects;
create policy "Owners upload own topup proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'topup-proofs' and (storage.foldername(name))[1] in (
    select o.id::text from public.owners o where o.profile_id = (select auth.uid())));
drop policy if exists "Owners read own topup proofs" on storage.objects;
create policy "Owners read own topup proofs" on storage.objects for select to authenticated
  using (bucket_id = 'topup-proofs' and (storage.foldername(name))[1] in (
    select o.id::text from public.owners o where o.profile_id = (select auth.uid())));
drop policy if exists "Admins read topup proofs" on storage.objects;
create policy "Admins read topup proofs" on storage.objects for select to authenticated
  using (bucket_id = 'topup-proofs' and public.is_admin());

-- Hide owner contact until the deposit has actually been confirmed.
create or replace view public.owner_booking_contacts
with (security_barrier = true)
as
select b.id as booking_id, p.full_name, p.phone
from public.bookings b join public.profiles p on p.id = b.customer_id
where b.status in ('confirmed', 'picked_up', 'returned', 'completed')
  and exists (select 1 from public.owners o where o.id = b.owner_id and o.profile_id = (select auth.uid()) and o.is_active);
grant select on public.owner_booking_contacts to authenticated;
