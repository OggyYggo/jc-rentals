# Payment Module: Owner-Direct QR Deposits + Platform Fee Credits (Phase 1)

This file **replaces the payment parts** of `car-rental-platform.md` (the `payments` table, booking statuses, and the booking flow) and **replaces the previous version of this file**. Everything else in the main plan stays the same.

**Why the change:** there is no business permit yet, so a payment gateway (PayMongo and similar) is not available. In this version the platform **never receives or holds customer money**. Customers pay the deposit straight to the **owner's own QR**, and the platform collects its **5% fee from the owner** through prepaid credits (or a monthly invoice).

---

## 1. What Changed From the Previous Version

| Topic | Before | Now |
|---|---|---|
| Who receives the deposit | The platform admin (your QR) | **The owner** (the owner's QR) |
| Who verifies the payment | Admin | **The owner** (admin can step in) |
| How the platform earns 5% | Kept from the deposit | **Deducted from the owner's prepaid credits** (or billed by invoice) |
| Owner payouts | Admin pays each owner | **Not needed** (owner already has the money) |
| Admin QR | Used for all deposits | Used only for **owner credit top-ups** and invoices |
| Risk to manage | Holding other people's money | Owners skipping the site to avoid the fee |

---

## 2. Money Model

For each booking:

```
total_price        = days * daily_rate
platform_fee       = total_price * commission_rate        (default 0.05, stored on the booking)
deposit_due_now    = total_price * deposit_percent        (default 0.30, owner can override)
balance_at_pickup  = total_price - deposit_due_now        (customer pays the owner at pickup)
```

**Example:** total ₱6,000
- Customer pays ₱1,800 deposit to the **owner's QR**
- Customer pays ₱4,200 balance to the **owner** at pickup
- Platform fee: ₱300, **deducted from the owner's credits** when the owner confirms the deposit
- Owner keeps ₱6,000 and has paid ₱300 in fees (₱5,700 net)

**Self-drive security deposit** (refundable, for damage) is collected and returned by the owner at pickup. The platform never handles it.

**Deposit refunds** (cancellations) are the owner's responsibility, since the owner holds the money. The platform shows the cancellation policy and tracks whether the refund was marked as done.

---

## 3. Platform Fee Models

Each owner has a `fee_mode`.

### Credits (default, recommended)
1. The owner tops up credits by paying **your QR** (small, simple amounts such as ₱500, ₱1,000, ₱2,000) and uploading proof.
2. You verify the top-up. Credits are added to the owner's balance.
3. When the owner **confirms a customer's deposit**, the system deducts the booking's 5% fee from the balance automatically.
4. If the balance is too low, the owner **cannot confirm** the booking until they top up.
5. If the balance falls below the minimum (default ₱500), the owner's cars are **hidden from the public** until they top up.

Why this works: you are paid before the owner earns, so there is nothing to chase.

### Invoice (for owners you trust)
1. Fees are recorded per booking.
2. At the end of each month (or week), an invoice is created per owner.
3. The owner pays your QR by the due date and uploads proof. You mark the invoice paid.
4. If an invoice is overdue (default grace: 7 days), the owner's cars are hidden until paid.

Start all 4 owners on **credits**. Switch an owner to invoice only after they have a good track record.

### Fee refunds
If a booking is cancelled before pickup, the platform fee is **refunded to the owner as credits** automatically. After pickup, no refund.

---

## 4. Booking Status Flow

```
awaiting_payment ──(customer uploads proof)──> payment_review
      │                                              │
      │ (deadline passes)                 (owner verifies)  │ (owner rejects)
      ▼                                              ▼          ▼
   expired                                       confirmed   awaiting_payment (re-upload, deadline kept)
                                                     │
                                         picked_up → returned → completed

cancelled / rejected can happen from awaiting_payment, payment_review or confirmed
```

| Status | Meaning | Dates held? |
|---|---|---|
| `awaiting_payment` | Booking created, waiting for the deposit | Yes, until `payment_due_at` |
| `payment_review` | Proof uploaded, waiting for the **owner** to verify | Yes |
| `confirmed` | Owner verified the deposit, **fee charged**, details shared | Yes |
| `picked_up` / `returned` / `completed` | Rental progress | Yes |
| `expired` | Customer did not pay in time | No |
| `cancelled` / `rejected` | Cancelled by customer, owner, or admin | No |

Default payment window: **24 hours** (setting).
**Owner response target:** 12 hours. Payments waiting longer than **6 hours** appear in an admin "slow review" list, and the admin can verify on the owner's behalf after contacting them.

---

## 5. Database Changes

Run in **two steps**. If you already ran the previous version of this file, the `if not exists` statements are safe to run again.

### Step A: statuses

```sql
alter type booking_status add value if not exists 'awaiting_payment';
alter type booking_status add value if not exists 'payment_review';
alter type booking_status add value if not exists 'expired';
```

Run this alone, then run Step B in a new query.

### Step B: tables, functions, rules

```sql
-- 1. Owners: payment setup and fee settings
alter table owners
  add column if not exists payment_method_label text,        -- GCash, Maya, Bank (display only)
  add column if not exists payment_account_name text,        -- name shown to customers
  add column if not exists payment_qr_path text,             -- private storage path
  add column if not exists payment_qr_verified boolean not null default false,
  add column if not exists fee_mode text not null default 'credits'
    check (fee_mode in ('credits', 'invoice')),
  add column if not exists deposit_percent numeric(4,3)
    check (deposit_percent between 0.1 and 1);               -- null = use platform default

-- 2. Bookings: payment tracking
alter table bookings
  add column if not exists payment_due_at timestamptz,
  add column if not exists amount_due_now numeric(10,2) not null default 0,
  add column if not exists amount_paid_online numeric(10,2) not null default 0,  -- deposit paid to the owner
  add column if not exists balance_at_pickup numeric(10,2) not null default 0,
  add column if not exists platform_fee_charged boolean not null default false,
  add column if not exists deposit_refund_status text not null default 'none'
    check (deposit_refund_status in ('none', 'owed', 'refunded'));

alter table bookings alter column status set default 'awaiting_payment';

-- 3. Double-booking constraint with the new statuses
alter table bookings drop constraint if exists no_double_booking;
alter table bookings add constraint no_double_booking exclude using gist (
  car_id with =, during with &&
) where (status in ('awaiting_payment', 'payment_review', 'confirmed', 'picked_up'));

-- 4. Payments: proof and verification
do $$ begin
  create type payment_proof_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

alter table payments
  add column if not exists status payment_proof_status not null default 'pending',
  add column if not exists reference_no text,       -- GCash / bank transaction reference
  add column if not exists proof_path text,         -- private storage path
  add column if not exists verified_by uuid references profiles(id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

-- The same transaction reference cannot be used twice
create unique index if not exists payments_reference_unique
  on payments (reference_no)
  where reference_no is not null and status <> 'rejected';

-- 5. Owner credit ledger (top-ups, fees, refunds, adjustments)
create table if not exists owner_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  type text not null check (type in ('topup', 'booking_fee', 'fee_refund', 'adjustment')),
  amount numeric(10,2) not null,                   -- positive adds credits, negative deducts
  status text not null default 'posted' check (status in ('pending', 'posted', 'rejected')),
  booking_id uuid references bookings(id),
  reference_no text,                               -- top-up transaction reference
  proof_path text,                                 -- top-up proof (private storage)
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists owner_credit_ledger_owner on owner_credit_ledger (owner_id, created_at);

-- One fee charge and one refund per booking, never duplicated
create unique index if not exists ledger_one_fee_per_booking
  on owner_credit_ledger (booking_id) where type = 'booking_fee';
create unique index if not exists ledger_one_refund_per_booking
  on owner_credit_ledger (booking_id) where type = 'fee_refund';
create unique index if not exists ledger_topup_reference_unique
  on owner_credit_ledger (reference_no)
  where type = 'topup' and reference_no is not null and status <> 'rejected';

create or replace view owner_credit_balances as
select o.id as owner_id,
       o.business_name,
       coalesce(sum(l.amount) filter (where l.status = 'posted'), 0) as balance
from owners o
left join owner_credit_ledger l on l.owner_id = o.id
group by o.id, o.business_name;

-- 6. Invoices (only for owners on fee_mode = 'invoice')
alter table commission_invoices add column if not exists due_date date;

-- 7. Settings
insert into settings (key, value) values
  ('deposit_percent', '0.30'),
  ('payment_window_hours', '24'),
  ('min_credit_to_list', '500'),
  ('invoice_grace_days', '7'),
  ('platform_account_name', '"Your Account Name"'),
  ('platform_qr_path', '""'),
  ('payment_instructions', '"Scan the QR, enter the exact amount, and put your booking reference in the message."')
on conflict (key) do nothing;
```

### Rules and functions (security definer, run after Step B)

```sql
-- Can this owner's cars be shown and booked?
create or replace function public.owner_can_accept(p_owner_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select o.is_active
     and o.payment_qr_verified
     and case o.fee_mode
           when 'credits' then
             coalesce((select sum(l.amount) from owner_credit_ledger l
                       where l.owner_id = o.id and l.status = 'posted'), 0)
             >= coalesce((select (value #>> '{}')::numeric from settings
                          where key = 'min_credit_to_list'), 0)
           else
             not exists (select 1 from commission_invoices i
                         where i.owner_id = o.id and i.status = 'unpaid'
                           and i.due_date is not null and i.due_date < current_date)
         end
  from owners o
  where o.id = p_owner_id
$$;

-- Public only sees cars whose owner can accept bookings
drop policy if exists "public read active cars" on cars;
create policy "public read active cars" on cars
  for select using (is_active = true and public.owner_can_accept(owner_id));
-- (owners still see their own cars through their own policy)

-- Owner (or admin) confirms the deposit: verifies the payment, charges the fee, confirms the booking
create or replace function public.confirm_booking_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_booking bookings%rowtype;
  v_owner owners%rowtype;
  v_balance numeric;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'pending' then
    raise exception 'Payment not found or already processed';
  end if;

  select * into v_booking from bookings where id = v_payment.booking_id for update;
  select * into v_owner from owners where id = v_booking.owner_id;

  if not (v_owner.profile_id = auth.uid() or public.current_role() = 'admin') then
    raise exception 'Not allowed';
  end if;

  if v_booking.status not in ('awaiting_payment', 'payment_review') then
    raise exception 'Booking is not waiting for payment';
  end if;

  if v_owner.fee_mode = 'credits' then
    select coalesce(sum(amount), 0) into v_balance
    from owner_credit_ledger where owner_id = v_owner.id and status = 'posted';

    if v_balance < v_booking.commission_amount then
      raise exception 'Not enough credits to cover the platform fee. Please top up first.';
    end if;

    insert into owner_credit_ledger (owner_id, type, amount, booking_id, status, note, created_by)
    values (v_owner.id, 'booking_fee', -v_booking.commission_amount, v_booking.id,
            'posted', 'Platform fee for ' || v_booking.reference, auth.uid());
  end if;

  update payments
     set status = 'verified', verified_by = auth.uid(), verified_at = now()
   where id = p_payment_id;

  update bookings
     set status = 'confirmed',
         amount_paid_online = v_payment.amount,
         platform_fee_charged = (v_owner.fee_mode = 'credits')
   where id = v_booking.id;
end; $$;

-- Owner (or admin) rejects the proof; the customer can upload again before the deadline
create or replace function public.reject_booking_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_booking bookings%rowtype;
  v_owner owners%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'pending' then
    raise exception 'Payment not found or already processed';
  end if;
  select * into v_booking from bookings where id = v_payment.booking_id for update;
  select * into v_owner from owners where id = v_booking.owner_id;

  if not (v_owner.profile_id = auth.uid() or public.current_role() = 'admin') then
    raise exception 'Not allowed';
  end if;

  update payments set status = 'rejected', rejection_reason = p_reason where id = p_payment_id;
  update bookings set status = 'awaiting_payment' where id = v_booking.id;
end; $$;

-- Cancel a booking and refund the platform fee as credits (before pickup only)
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_owner owners%rowtype;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into v_owner from owners where id = v_booking.owner_id;

  if not (v_booking.customer_id = auth.uid()
          or v_owner.profile_id = auth.uid()
          or public.current_role() = 'admin') then
    raise exception 'Not allowed';
  end if;

  if v_booking.status not in ('awaiting_payment', 'payment_review', 'confirmed') then
    raise exception 'This booking can no longer be cancelled';
  end if;

  if v_booking.customer_id = auth.uid() and v_booking.start_date <= current_date then
    raise exception 'Customers can only cancel before the rental starts';
  end if;

  if v_booking.platform_fee_charged then
    insert into owner_credit_ledger (owner_id, type, amount, booking_id, status, note, created_by)
    values (v_owner.id, 'fee_refund', v_booking.commission_amount, v_booking.id,
            'posted', 'Fee refunded: booking cancelled', auth.uid());
  end if;

  update bookings
     set status = 'cancelled',
         cancel_reason = p_reason,
         platform_fee_charged = false,
         deposit_refund_status = case when amount_paid_online > 0 then 'owed' else 'none' end
   where id = v_booking.id;
end; $$;

-- Only signed-in users can call these functions
revoke all on function public.confirm_booking_payment(uuid) from public;
revoke all on function public.reject_booking_payment(uuid, text) from public;
revoke all on function public.cancel_booking(uuid, text) from public;
grant execute on function public.confirm_booking_payment(uuid) to authenticated;
grant execute on function public.reject_booking_payment(uuid, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
```

If the app already has a cancel action from the earlier migrations, route it through `cancel_booking` so the fee refund and deposit-refund flag stay correct.

### Auto-expire unpaid bookings
Use `pg_cron` (enable it in Supabase: Database > Extensions). Vercel's free plan only allows daily cron jobs, which is too slow for a 24-hour window.

```sql
select cron.schedule(
  'expire-unpaid-bookings',
  '*/10 * * * *',
  $$ update bookings
     set status = 'expired'
     where status = 'awaiting_payment' and payment_due_at < now() $$
);
```

### If the old version was already installed
The `payouts` table and the `owner_balances` view from the previous version are no longer needed. If they exist and are empty, they can be dropped. The new columns above reuse the same names where possible.

---

## 6. Row Level Security

```sql
alter table payments enable row level security;
alter table owner_credit_ledger enable row level security;

-- Payments
create policy "customer reads own payments" on payments
  for select using (
    booking_id in (select id from bookings where customer_id = auth.uid())
  );

create policy "customer adds proof to own booking" on payments
  for insert with check (
    status = 'pending'
    and booking_id in (
      select id from bookings
      where customer_id = auth.uid()
        and status in ('awaiting_payment', 'payment_review')
    )
  );

create policy "owner reads payments of own bookings" on payments
  for select using (
    booking_id in (
      select b.id from bookings b
      join owners o on o.id = b.owner_id
      where o.profile_id = auth.uid()
    )
  );

create policy "admin all payments" on payments
  for all using (public.current_role() = 'admin');

-- Credit ledger
create policy "owner reads own ledger" on owner_credit_ledger
  for select using (
    owner_id in (select id from owners where profile_id = auth.uid())
  );

create policy "owner requests top-up" on owner_credit_ledger
  for insert with check (
    type = 'topup' and status = 'pending' and amount > 0
    and owner_id in (select id from owners where profile_id = auth.uid())
  );

create policy "admin all ledger" on owner_credit_ledger
  for all using (public.current_role() = 'admin');
```

Owners and customers must **not** be able to change `payments.status`, `bookings.status`, `amount_paid_online`, or ledger rows directly. All status changes go through the functions in section 5.

**Owner payment settings:** owners may edit `payment_method_label`, `payment_account_name`, and `payment_qr_path` on their own row, but **any change sets `payment_qr_verified = false`** (use a trigger) so their cars are hidden until you verify the new QR again. Owners cannot edit `fee_mode`, `deposit_percent`, `payment_qr_verified`, or `commission_rate`; only admins can.

### Storage buckets (all private)

| Bucket | Contents | Who can read |
|---|---|---|
| `payment-proofs` | Customer deposit screenshots, in `{customer_id}/...` | The customer, the booking's owner, admins |
| `owner-qr` | Owner QR images, in `{owner_id}/...` | The owner and admins. Customers see it **only through a server-generated signed link** on their own pay page |
| `topup-proofs` | Owner top-up screenshots, in `{owner_id}/...` | The owner and admins |

The platform's own QR (for top-ups and invoices) can be a normal image shown only to signed-in owners.

---

## 7. Step-by-Step Flow

### One-time owner setup
1. Owner opens `/owner/payment-settings`: picks the method label (GCash, Maya, Bank), enters the **account name exactly as it appears in their app**, and uploads their QR.
2. Admin checks the QR image and account name, then sets `payment_qr_verified = true`. Until then the owner's cars are not public.
3. Owner tops up credits (see below). Minimum balance to list: ₱500 (setting).

### Customer side
1. **Create booking** (server action `createBooking`)
   - Validate dates and availability, and recompute price from `car_rates` on the server.
   - Compute `commission_amount` (owner's rate), `amount_due_now` (owner's `deposit_percent` or the default), and `balance_at_pickup`.
   - Insert as `awaiting_payment` with `payment_due_at = now() + window`.
   - Redirect to the pay page.
2. **Pay page** shows:
   - **"Pay to: [owner business name]"** with the account name and the owner's QR (signed link)
   - Exact amount to pay now (large) and the booking reference to put in the message
   - Countdown to the deadline, and the balance to pay the owner at pickup
   - A clear note: *"This payment goes directly to the car owner. Kuyog Bohol does not receive it."*
3. **Upload proof** (server action `submitPaymentProof`): screenshot, transaction reference number, amount sent, date and time. Convert the image to WebP (quality 85), store in `payment-proofs`, insert a `payments` row as `pending`, and set the booking to `payment_review`. A reused reference number is rejected with a clear message.

### Owner side
4. `/owner/payments` shows bookings in `payment_review` with the screenshot, reference number, amount, and time.
5. **Verify:** the owner checks **their own** GCash or bank history (never the screenshot alone) and taps **Confirm**, which calls `confirm_booking_payment`. The platform fee is deducted, the booking is `confirmed`, and the customer's contact details are shown to the owner **from this point on**.
6. **Reject:** the owner enters a reason and calls `reject_booking_payment`. The customer can upload again before the deadline.
7. At pickup the customer pays the **balance** to the owner. The owner marks `picked_up`, then `returned`, then `completed`.
8. If a booking is cancelled, the owner returns the customer's deposit per the cancellation policy and marks `deposit_refund_status = refunded`.

### Credit top-up (owner pays the platform)
9. `/owner/credits` shows the balance, the ledger, your QR, and suggested amounts.
10. The owner pays your QR, then enters the amount and reference number and uploads proof. This creates a `topup` ledger row as `pending`.
11. `/admin/topups` shows pending top-ups. You check **your** GCash or bank history and mark the row `posted` (credits added) or `rejected` with a reason.

### Admin side
12. `/admin/payments`: all deposits, plus the **slow review** list (waiting more than 6 hours). Admin can confirm on the owner's behalf after contacting them.
13. `/admin/fees`: fees charged, credits outstanding per owner, invoices (for invoice-mode owners), and cancellation rate per owner.
14. `/admin/owners/[id]`: verify the QR, set `fee_mode`, `commission_rate`, and `deposit_percent`.
15. `/admin/settings`: deposit percent, payment window, minimum credit to list, invoice grace days, your QR and account name.

---

## 8. Pages and Components

| Route | Purpose |
|---|---|
| `/account/bookings/[id]/pay` | Owner's QR, amount, reference, countdown, proof upload |
| `/account/bookings` | Status badges and a "Pay now" button for `awaiting_payment` |
| `/owner/payment-settings` | Method label, account name, QR upload, verification status |
| `/owner/payments` | Deposit verification queue (confirm and reject) |
| `/owner/credits` | Balance, ledger, top-up form, fee history |
| `/owner/earnings` | Gross, platform fees, net, balances due at pickup |
| `/admin/topups` | Verify owner top-ups |
| `/admin/payments` | All deposits and slow-review list |
| `/admin/fees` | Fees, credits, invoices, cancellation rates |
| `/admin/owners/[id]` | QR verification, fee mode, rates |
| `/admin/settings` | Platform payment settings |

Dashboard screens keep the present dashboard design. The customer pay page follows the blue and white public theme in `customer-home-implementation.md` section 12.

**shadcn components:** `Card`, `Badge`, `Dialog` (proof viewer), `Form`, `Input`, `Table`, `Tabs`, `Alert`, `Button`, `Sonner`.

**Owner credits card:** big balance number, a warning banner when the balance is below the minimum ("Your cars are hidden until you top up"), and a "Top up" button.

---

## 9. Server Action Skeletons

```ts
// actions/payments.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function confirmPayment(paymentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_booking_payment", { p_payment_id: paymentId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/owner/payments");
  return { ok: true };
}

export async function rejectPayment(paymentId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_booking_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/owner/payments");
  return { ok: true };
}

export async function cancelBooking(bookingId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/account/bookings");
  return { ok: true };
}
```

The checks (owner or admin, enough credits, status rules) live **inside the database functions**, so they cannot be skipped from the browser.

**Signed link for the owner QR on the customer pay page:** a server action first checks that the signed-in customer owns the booking and that its status is `awaiting_payment` or `payment_review`. Then it creates a short-lived signed URL (about 60 seconds) with the service role key.

---

## 10. Preventing Bookings Outside the Site

The main risk is an owner moving customers to Messenger to skip the 5% fee. Reduce it with these rules:

- [ ] Customer **contact details are hidden from the owner until the booking is confirmed** (fee charged).
- [ ] The fee is charged at **confirmation**, not at completion.
- [ ] Public pages and templates show the **website link**, never the owner's phone number (see `promo-kit-implementation.md`).
- [ ] The owner agreement says all bookings from customers found through Kuyog Bohol must go through the platform, and states the consequence (suspension).
- [ ] Watch each owner's **cancellation rate** and bookings in `/admin/fees`. Many cancellations after customers have the owner's details are a warning sign.
- [ ] Cars are hidden when credits run out, so owners always have a reason to keep topping up.
- [ ] A short note on the car page: "Book on Kuyog Bohol to be protected by the cancellation policy and verified owners."

---

## 11. Fraud and Safety Checklist

- [ ] **Owners never confirm from a screenshot alone.** They open their own GCash or bank history and match the amount, reference number, and time.
- [ ] Reference numbers are unique (database index), so reused screenshots are rejected.
- [ ] The **admin verifies each owner's QR and account name** before cars go public. Any change to the QR hides the cars again until re-verified.
- [ ] The pay page shows the **account name** so customers can confirm they are paying the right person.
- [ ] Payment proofs and QR images are in private buckets with signed links only.
- [ ] Prices, deposits, and fees are computed **on the server** only.
- [ ] Status changes happen only through the database functions (owner or admin check inside).
- [ ] Keep a log of every confirm, reject, top-up, fee, and refund (ledger rows and `verified_by`).
- [ ] Customer ID and license documents stay in the private `customer-docs` bucket, as before.

---

## 12. Policies to Display

- **Deposit:** a deposit (default 30% of the total) is paid directly to the car owner within 24 hours to hold the booking. Unpaid bookings expire automatically.
- **Balance:** paid directly to the owner at pickup.
- **Security deposit** (self-drive): collected and returned by the owner.
- **Cancellation:** define clearly, for example full deposit refund 7 or more days before pickup, 50% within 3 to 6 days, none within 48 hours. The **owner** refunds the deposit and marks it as refunded.
- **Owner cancellation:** full deposit refund to the customer, and Kuyog Bohol helps rebook with another car.
- **Platform role:** Kuyog Bohol is the booking service. The car owner provides the vehicle and receives the payments.

Add the same points to the Terms page and to the written agreement with each owner (5% fee, credits, hidden cars when credits are low, no bookings outside the platform, deposit refunds).

---

## 13. Legal and Tax Notes

- The platform does not receive customer payments in this version, which keeps things simpler. The platform's income is the **5% fees** paid by owners.
- Register the business name with DTI and register with BIR so you can report that income properly. Ask DTI or BIR what applies to you, and confirm the owner agreement with a lawyer. This is not legal or tax advice.
- When you are registered, a payment gateway with a dynamic QR Ph per booking can replace the manual steps (see section 15).

---

## 14. Implementation Checklist

- [ ] Run Step A, then Step B SQL, then the functions block
- [ ] Update the public cars policy to use `owner_can_accept`
- [ ] Create the private buckets `payment-proofs`, `owner-qr`, `topup-proofs` with policies
- [ ] Add the trigger that resets `payment_qr_verified` when an owner changes QR details
- [ ] Enable `pg_cron` and schedule the expiry job
- [ ] Add your platform QR and account name in settings
- [ ] Build `/owner/payment-settings` and the admin QR verification
- [ ] Update `createBooking` to compute fee, deposit, and deadline
- [ ] Build the customer pay page and proof upload (WebP conversion, signed link for the owner QR)
- [ ] Build `/owner/payments` with confirm and reject
- [ ] Build `/owner/credits` and `/admin/topups`
- [ ] Route all cancellations through `cancel_booking`
- [ ] Build `/admin/payments` (slow review) and `/admin/fees`
- [ ] Add the policy text to the car page and Terms
- [ ] Test the full flow with small real payments (for example ₱20 for a deposit and ₱100 for a top-up) before launch

---

## 15. Upgrading Later (Phase 2)

Once the business is registered, a gateway such as PayMongo can provide a dynamic QR Ph per booking with the exact amount, plus automatic confirmation by webhook. Possible ways to upgrade:

- **Gateway for deposits, owners keep manual QR as a fallback.** The webhook inserts a `verified` payment and confirms the booking automatically.
- **Gateway for fee top-ups only.** Owners top up credits by card or e-wallet, and credits post instantly with no admin check.

The same tables work for both, so nothing here has to be thrown away.

---

## 16. Open Questions

- Minimum credit to list (default ₱500) and the suggested top-up amounts
- Default deposit percent (30%?) and whether owners may choose their own
- Owner response target for deposit checks (12 hours?) and what happens when it is missed
- Exact cancellation and deposit refund rules for the Terms page
- Will all 4 owners start on credits, or will some start on monthly invoices?
