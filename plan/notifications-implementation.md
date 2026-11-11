# Kuyog Bohol: Notifications Implementation Plan

> Put this file in `plan/notifications-implementation.md`.
> Scope: **Phase 1 = in-app bell + email**, **Phase 2 = web push** (on top of the PWA).
> Out of scope for now: SMS, Telegram/Messenger bots.
> Stack: Next.js 16 · Supabase (Postgres, Auth, Realtime, `pg_cron`, `pg_net`) · Resend · Vercel · `web-push`.

---

## 1. Why

Today nobody knows something happened unless they open the site. The slowest step in the booking flow is the **owner verifying a payment proof**, and the customer is waiting on it. If that alert is missed, the customer cancels or books another car.

Goals:

1. Every important booking event reaches the right person quickly.
2. Works for everyone with **no install** (bell + email).
3. Owners and admin get **real phone alerts** (web push) once they install the PWA.
4. Stays inside free tiers. No duplicate or spammy alerts.

---

## 2. How it works (one picture)

```
 booking / top-up / document event
            │
   DB trigger  or  server action
            │  calls notify()
            ▼
   notifications table  ──(Realtime)──►  bell updates instantly
            │
   Database Webhook (pg_net)
            ▼
   POST /api/notifications/dispatch   (Vercel route, secret-protected)
        ├── email  → Resend
        └── push   → web-push → phone   (Phase 2)

   pg_cron (every 10 min) → reminders (deadline soon, proof waiting, pickup tomorrow, low credits)
   pg_cron (every 5 min)  → sweep: retry failed email/push
```

Rule: **one row in `notifications` per alert.** The bell reads that table, email and push are just delivery methods for the same row.

---

## 3. Event catalog

`C` = critical (cannot be muted). In-app is always on.

### Customer

| Type | When | Email | Push | C |
|---|---|---|---|---|
| `account_approved` | Admin approves documents | ✅ | ✅ | ✅ |
| `account_rejected` | Admin rejects documents (with reason) | ✅ | ✅ | ✅ |
| `booking_created` | Booking made, deposit due | ✅ | | |
| `payment_deadline_soon` | 2 h before `payment_due_at` | ✅ | ✅ | |
| `payment_verified` | Owner verified deposit, booking confirmed | ✅ | ✅ | ✅ |
| `payment_rejected` | Owner rejected proof, re-upload needed | ✅ | ✅ | ✅ |
| `booking_expired` | Deadline passed unpaid | ✅ | | |
| `booking_cancelled` | Owner or admin cancelled | ✅ | ✅ | ✅ |
| `pickup_tomorrow` | Day before start date | ✅ | ✅ | |

### Owner

| Type | When | Email | Push | C |
|---|---|---|---|---|
| `new_booking` | Customer created a booking | ✅ | ✅ | |
| `payment_proof_uploaded` | Booking → `payment_review` | ✅ | ✅ | ✅ |
| `proof_pending_owner` | Proof unverified for 6 h (limit is 12 h) | ✅ | ✅ | ✅ |
| `booking_cancelled` | Customer cancelled (fee refunded as credits) | ✅ | ✅ | |
| `pickup_tomorrow` | Day before start date | | ✅ | |
| `low_credits` | Credits below the threshold | ✅ | ✅ | ✅ |
| `topup_approved` / `topup_rejected` | Admin decided on a top-up | ✅ | ✅ | |
| `qr_verified` / `qr_rejected` | Admin decided on the owner's QR | ✅ | ✅ | |

### Admin

| Type | When | Email | Push | C |
|---|---|---|---|---|
| `customer_pending_review` | Customer submitted both documents | | ✅ | |
| `topup_requested` | Owner submitted a top-up proof | ✅ | ✅ | |
| `qr_pending` | Owner uploaded or changed QR | | ✅ | |
| `proof_pending_admin` | Proof unverified for 6 h (admin may verify) | | ✅ | |

Admin email is off for most events on purpose (volume). Admin lives on bell + push.

---

## 3b. Assumptions about your existing schema

The SQL below uses these names. **Adjust to match your migrations:**

- `bookings`: `id`, `customer_id`, `owner_id`, `status`, `start_date`, `payment_due_at`, and a timestamp for when the proof was uploaded (call it `payment_submitted_at`; add it if missing).
- `owners`: `id`, `user_id` (the auth user of the owner).
- `profiles`: `id`, `role` (`'customer' | 'owner' | 'admin'`).
- A way to read an owner's credit balance (sum of `owner_credit_ledger`) and `min_credit_to_list` from platform settings.

---

## 4. Database (new migration `202611110001_notifications.sql`)

### 4.1 Tables

```sql
create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null,
  title            text not null,
  body             text,
  url              text,                       -- where tapping goes, e.g. /owner/bookings/<id>
  booking_id       uuid references public.bookings(id) on delete set null,
  dedupe_key       text,                       -- stops duplicate alerts
  channels         text[] not null default '{in_app}',   -- subset of: in_app, email, push
  critical         boolean not null default false,
  read_at          timestamptz,
  email_sent_at    timestamptz,
  push_sent_at     timestamptz,
  delivery_error   text,
  delivery_attempts int not null default 0,
  created_at       timestamptz not null default now()
);

create unique index if not exists notifications_dedupe_uq
  on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

create table if not exists public.notification_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled  boolean not null default true,
  muted_types   text[]  not null default '{}'
);

-- Phase 2 (create now or later)
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
```

### 4.2 RLS

```sql
alter table public.notifications            enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions       enable row level security;

-- Users read only their own notifications. No client insert/update/delete.
create policy "own notifications read" on public.notifications
  for select using (user_id = auth.uid());

-- Preferences: own row only.
create policy "own prefs read"   on public.notification_preferences for select using (user_id = auth.uid());
create policy "own prefs insert" on public.notification_preferences for insert with check (user_id = auth.uid());
create policy "own prefs update" on public.notification_preferences for update using (user_id = auth.uid());

-- Push subscriptions: own rows only.
create policy "own subs read"   on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own subs insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "own subs delete" on public.push_subscriptions for delete using (user_id = auth.uid());

-- Realtime for the bell
alter publication supabase_realtime add table public.notifications;
```

Marking as read goes through a function (so clients can't edit titles or bodies):

```sql
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
```

### 4.3 The `notify()` helper

All alerts go through one function. It applies the user's preferences, then inserts. Duplicate `dedupe_key` is silently ignored.

```sql
create or replace function public.notify(
  p_user     uuid,
  p_type     text,
  p_title    text,
  p_body     text,
  p_url      text,
  p_booking  uuid    default null,
  p_channels text[]  default '{in_app}',
  p_critical boolean default false,
  p_dedupe   text    default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  prefs notification_preferences%rowtype;
  v_channels text[] := p_channels;
begin
  if p_user is null then return; end if;
  select * into prefs from notification_preferences where user_id = p_user;

  if not p_critical and found then
    if not prefs.email_enabled then v_channels := array_remove(v_channels, 'email'); end if;
    if not prefs.push_enabled  then v_channels := array_remove(v_channels, 'push');  end if;
    if p_type = any(prefs.muted_types) then v_channels := '{in_app}'; end if;
  end if;

  insert into notifications (user_id, type, title, body, url, booking_id, channels, critical, dedupe_key)
  values (p_user, p_type, p_title, p_body, p_url, p_booking, v_channels, p_critical, p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

revoke all on function public.notify(uuid,text,text,text,text,uuid,text[],boolean,text) from public;
-- only triggers / service role call it; do NOT grant to authenticated.
```

Helper to alert every admin:

```sql
create or replace function public.notify_admins(
  p_type text, p_title text, p_body text, p_url text,
  p_channels text[] default '{in_app,push}', p_critical boolean default false, p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  for a in select id from profiles where role = 'admin' loop
    perform notify(a, p_type, p_title, p_body, p_url, null, p_channels, p_critical,
                   case when p_dedupe is null then null else p_dedupe || ':' || a end);
  end loop;
end $$;
revoke all on function public.notify_admins(text,text,text,text,text[],boolean,text) from public;
```

### 4.4 Booking triggers

Booking events come from many code paths (customer, owner, admin, cron), so they are fired from the database, not the app.

```sql
create or replace function public.notify_booking_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner_user uuid;
begin
  select user_id into v_owner_user from owners where id = new.owner_id;

  if tg_op = 'INSERT' then
    perform notify(v_owner_user, 'new_booking', 'New booking request',
      'A customer booked one of your cars. Waiting for their deposit.',
      '/owner/bookings/' || new.id, new.id, '{in_app,email,push}');
    perform notify(new.customer_id, 'booking_created', 'Booking created',
      'Pay your deposit before the deadline to keep your dates.',
      '/account/bookings/' || new.id || '/pay', new.id, '{in_app,email}');
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  case new.status
    when 'payment_review' then
      perform notify(v_owner_user, 'payment_proof_uploaded', 'Payment proof to verify',
        'A customer uploaded a deposit proof. Please check your wallet and verify.',
        '/owner/bookings/' || new.id, new.id, '{in_app,email,push}', true);
    when 'confirmed' then
      perform notify(new.customer_id, 'payment_verified', 'Booking confirmed',
        'Your deposit was verified. See pickup details in your booking.',
        '/account/bookings/' || new.id, new.id, '{in_app,email,push}', true);
    when 'awaiting_payment' then   -- only reachable from payment_review (proof rejected)
      if old.status = 'payment_review' then
        perform notify(new.customer_id, 'payment_rejected', 'Payment proof rejected',
          'Please upload a clear proof again before your deadline.',
          '/account/bookings/' || new.id || '/pay', new.id, '{in_app,email,push}', true);
      end if;
    when 'expired' then
      perform notify(new.customer_id, 'booking_expired', 'Booking expired',
        'The deposit was not received in time and the dates were released.',
        '/account/bookings/' || new.id, new.id, '{in_app,email}');
    when 'cancelled', 'rejected' then
      perform notify(new.customer_id, 'booking_cancelled', 'Booking cancelled',
        'Your booking was cancelled. Open it for details.',
        '/account/bookings/' || new.id, new.id, '{in_app,email,push}', true);
      perform notify(v_owner_user, 'booking_cancelled', 'Booking cancelled',
        'A booking was cancelled. Any platform fee is refunded as credits.',
        '/owner/bookings/' || new.id, new.id, '{in_app,email,push}');
    else null;
  end case;
  return new;
end $$;

drop trigger if exists trg_notify_booking_events on public.bookings;
create trigger trg_notify_booking_events
  after insert or update of status on public.bookings
  for each row execute function public.notify_booking_events();
```

> Cancel notices go to both sides. To avoid telling someone about their own action, skip the party who made the change (use `auth.uid()` when available).
>
> Keep the text generic. No amounts or full names in the notification title or body; the details live behind the login. Email and lock-screen push are less private than the site.

### 4.5 Reminders (`pg_cron`)

```sql
create or replace function public.send_notification_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_owner_user uuid;
begin
  -- 1) Customer: deposit deadline in under 2 hours
  for r in select id, customer_id from bookings
           where status = 'awaiting_payment'
             and payment_due_at between now() and now() + interval '2 hours'
  loop
    perform notify(r.customer_id, 'payment_deadline_soon', 'Deposit deadline soon',
      'Your dates will be released soon if the deposit is not paid.',
      '/account/bookings/' || r.id || '/pay', r.id, '{in_app,email,push}', false,
      'deadline:' || r.id);
  end loop;

  -- 2) Owner + admin: proof waiting for 6+ hours
  for r in select b.id, o.user_id as owner_user from bookings b join owners o on o.id = b.owner_id
           where b.status = 'payment_review'
             and b.payment_submitted_at < now() - interval '6 hours'
  loop
    perform notify(r.owner_user, 'proof_pending_owner', 'Customer is waiting for you',
      'A payment proof has been waiting for 6 hours. Please verify it.',
      '/owner/bookings/' || r.id, r.id, '{in_app,email,push}', true, 'pending6:' || r.id);
    perform notify_admins('proof_pending_admin', 'Payment proof waiting 6h',
      'You can now verify this payment if the owner has not.',
      '/admin/payments', '{in_app,push}', false, 'pending6a:' || r.id);
  end loop;

  -- 3) Customer + owner: pickup tomorrow (Manila date)
  for r in select b.id, b.customer_id, o.user_id as owner_user
           from bookings b join owners o on o.id = b.owner_id
           where b.status = 'confirmed'
             and b.start_date = (now() at time zone 'Asia/Manila')::date + 1
  loop
    perform notify(r.customer_id, 'pickup_tomorrow', 'Pickup is tomorrow',
      'Check your booking for pickup details.', '/account/bookings/' || r.id, r.id,
      '{in_app,email,push}', false, 'pickup:' || r.id);
    perform notify(r.owner_user, 'pickup_tomorrow', 'Pickup tomorrow',
      'A booking starts tomorrow.', '/owner/bookings/' || r.id, r.id,
      '{in_app,push}', false, 'pickup:' || r.id);
  end loop;

  -- 4) Owner: low credits  (adjust the balance query + threshold to your schema)
  -- for r in select o.user_id, bal from <owner balances> where bal < <threshold> loop
  --   perform notify(r.user_id, 'low_credits', 'Credits running low',
  --     'Top up so you can keep accepting bookings.', '/owner/credits', null,
  --     '{in_app,email,push}', true, 'lowcredit:' || r.user_id || ':' || current_date);
  -- end loop;
end $$;

select cron.schedule('notification-reminders', '*/10 * * * *', $$select public.send_notification_reminders()$$);
```

`dedupe_key` makes every reminder fire **once** per booking, even though the job runs every 10 minutes.

### 4.6 Triggering delivery

Create a **Database Webhook** (Supabase Dashboard → Database → Webhooks) on `INSERT` of `public.notifications`:

- URL: `https://<your-domain>/api/notifications/dispatch`
- Header: `x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>`

And a sweep that retries failures (Vercel Hobby cron only runs once a day, so use `pg_cron` + `pg_net`):

```sql
select cron.schedule('notification-sweep', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://<your-domain>/api/notifications/dispatch?sweep=1',
    headers := jsonb_build_object('x-webhook-secret', '<NOTIFY_WEBHOOK_SECRET>')
  )
$$);
```

---

## 5. App code

### 5.1 Environment variables

```
RESEND_API_KEY=
EMAIL_FROM="Kuyog Bohol <notify@yourdomain.com>"
NOTIFY_WEBHOOK_SECRET=            # long random string, same one in the webhook + cron
NOTIFY_DAILY_EMAIL_CAP=80         # soft cap, see section 7
# Phase 2
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@yourdomain.com
```

### 5.2 Dispatch route `app/api/notifications/dispatch/route.ts`

Must be excluded from the login/session redirect in `proxy.ts`. It is protected by the secret, not by a user session.

```ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";   // server-only, uses SUPABASE_SECRET_KEY
import { renderEmail } from "@/lib/notifications/email";
import { sendPush } from "@/lib/notifications/push";        // Phase 2

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  if (req.headers.get("x-webhook-secret") !== process.env.NOTIFY_WEBHOOK_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const url = new URL(req.url);
  let rows;

  if (url.searchParams.get("sweep")) {
    // retry anything undelivered from the last 24 h, max 3 attempts
    const { data } = await supabase.from("notifications").select("*")
      .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString())
      .lt("delivery_attempts", 3)
      .or("and(channels.cs.{email},email_sent_at.is.null),and(channels.cs.{push},push_sent_at.is.null)");
    rows = data ?? [];
  } else {
    const body = await req.json();               // Database Webhook payload
    rows = [body.record];
  }

  for (const n of rows) await deliver(supabase, n);
  return NextResponse.json({ ok: true, count: rows.length });
}

async function deliver(supabase: ReturnType<typeof createAdminClient>, n: any) {
  const patch: Record<string, unknown> = { delivery_attempts: (n.delivery_attempts ?? 0) + 1 };
  const errors: string[] = [];

  if (n.channels.includes("email") && !n.email_sent_at) {
    try {
      if (!n.critical && (await emailCapReached(supabase))) throw new Error("daily cap");
      const { data } = await supabase.auth.admin.getUserById(n.user_id);
      const to = data.user?.email;
      if (!to) throw new Error("no email");
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!, to, subject: n.title, ...renderEmail(n),
      });
      if (error) throw new Error(error.message);
      patch.email_sent_at = new Date().toISOString();
    } catch (e: any) { errors.push("email: " + e.message); }
  }

  if (n.channels.includes("push") && !n.push_sent_at) {       // Phase 2
    try { if (await sendPush(supabase, n)) patch.push_sent_at = new Date().toISOString(); }
    catch (e: any) { errors.push("push: " + e.message); }
  }

  patch.delivery_error = errors.join("; ") || null;
  await supabase.from("notifications").update(patch).eq("id", n.id);
}

async function emailCapReached(supabase: ReturnType<typeof createAdminClient>) {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .gte("email_sent_at", since.toISOString());
  return (count ?? 0) >= Number(process.env.NOTIFY_DAILY_EMAIL_CAP ?? 80);
}
```

> A push-only user whose `push_sent_at` stays null because they have no subscription would be retried 3 times by the sweep. That is fine. Mark it sent when the user has no subscriptions, to avoid pointless retries.

### 5.3 Email template `lib/notifications/email.ts`

Keep it simple: one template for every type, blue and white to match the brand.

```ts
export function renderEmail(n: { title: string; body?: string | null; url?: string | null }) {
  const link = n.url ? `${process.env.NEXT_PUBLIC_SITE_URL}${n.url}` : process.env.NEXT_PUBLIC_SITE_URL!;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0F2342">
    <div style="background:#0A47B1;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold">Kuyog Bohol</div>
    <div style="border:1px solid #D6E6F7;border-top:0;padding:20px;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 8px">${n.title}</h2>
      <p style="margin:0 0 20px;color:#51657F">${n.body ?? ""}</p>
      <a href="${link}" style="background:#0B63CE;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Open in Kuyog Bohol</a>
      <p style="margin-top:24px;font-size:12px;color:#51657F">Change which alerts you get in Notification settings on the site.</p>
    </div>
  </div>`;
  return { html, text: `${n.title}\n${n.body ?? ""}\n${link}` };
}
```

Titles and bodies come from your own SQL and code, not from user input, so putting them straight into the HTML is safe. If you ever include user-typed text (names, rejection reasons), escape it first.

### 5.4 The bell

Place it in the header of `/account`, `/owner` and `/admin`.

`components/notifications/notification-bell.tsx` (client component):

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
// shadcn: Popover, Button

type N = { id: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string };

export function NotificationBell({ userId, initial }: { userId: string; initial: N[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<N[]>(initial);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    const ch = supabase.channel("notifications:" + userId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => setItems((cur) => [p.new as N, ...cur].slice(0, 20)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  async function open(n: N) {
    if (!n.read_at) {
      await supabase.rpc("mark_notifications_read", { p_ids: [n.id] });
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.url) router.push(n.url);
  }
  async function markAll() {
    await supabase.rpc("mark_notifications_read", { p_ids: null });
    setItems((cur) => cur.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  }
  // Render: Bell icon + red badge when unread > 0 (show "9+" above 9),
  // Popover list (title, body, relative time, blue dot if unread),
  // header "Mark all as read", footer link to /notifications.
}
```

The server layout loads the first 20 notifications for the logged-in user and passes them as `initial`.

Pages:

- `/notifications`: the full list with pagination and an "unread only" filter. One page, all roles.
- `/notifications/settings`: toggles for email, push, and a mute switch per non-critical type. Critical types show as "Always on".

Behavior:

- Unread items have a blue dot and a light blue background.
- Tapping an item marks it read and opens its `url`.
- If Realtime drops, the list still loads fresh on the next page view.

---

## 6. Phase 2: Web push

Do this after Phase 1 works. It builds on the PWA setup (`app/manifest.ts`, icons).

### 6.1 Who gets it

| Role | Approach |
|---|---|
| **Owner, admin** | Show a "Turn on phone alerts" banner in the dashboard. They open the site daily and will install it. |
| **Customer** | Optional. Offer it once, on the booking-created page: "Get alerts about this booking". They book once or twice, so email stays their main channel. |

### 6.2 Setup

1. Generate keys once: `npx web-push generate-vapid-keys`. Put them in env vars (section 5.1). Never expose the private key.
2. `npm i web-push`.
3. `public/sw.js`:

```js
self.addEventListener("push", (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(d.title || "Kuyog Bohol", {
    body: d.body || "",
    icon: "/icon-192.png",
    tag: d.tag,                    // same tag replaces an older alert instead of stacking
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data.url;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
      return clients.openWindow(url);
    })
  );
});
```

4. In `next.config`, serve `/sw.js` with `Cache-Control: no-cache` so updates reach phones.
5. In `proxy.ts`, exclude `/sw.js` and `/api/notifications/dispatch` from auth redirects.

### 6.3 Subscribe flow (client)

```ts
export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  const reg = await navigator.serviceWorker.register("/sw.js");
  const perm = await Notification.requestPermission();      // call ONLY from a button click
  if (perm !== "granted") return "denied";
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  await fetch("/api/push/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return "ok";
}
```

- `POST /api/push/subscribe`: requires a logged-in user, upserts into `push_subscriptions` (`endpoint`, `keys.p256dh`, `keys.auth`, `user_agent`).
- `DELETE /api/push/subscribe`: removes this device (used by the "Turn off" toggle).
- Never ask for permission on page load. Browsers punish this and users tap "Block", which is hard to undo.

### 6.4 Sending `lib/notifications/push.ts`

```ts
import webpush from "web-push";
webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

export async function sendPush(supabase: any, n: { user_id: string; title: string; body?: string; url?: string; type: string }) {
  const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", n.user_id);
  if (!subs?.length) return true;                       // nothing to send; treat as done
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.type });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
      await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410)   // device unsubscribed or uninstalled
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent > 0 || subs.length === 0;
}
```

### 6.5 Platform notes

| Platform | What to expect |
|---|---|
| Android, Chrome | Works in the browser, no install needed. Installing the PWA makes it feel like an app. |
| iPhone, Safari (iOS 16.4+) | Works **only after "Add to Home Screen"**, and only for the installed app. |
| Desktop | Works in Chrome, Edge and Firefox. |

On iPhone, when not installed, show a short helper instead of the enable button: "Tap Share, then Add to Home Screen, then open the app and turn on alerts." Detect it with `navigator.standalone` or `matchMedia('(display-mode: standalone)')`.

Push can fail silently (battery saver, blocked notifications, user cleared site data). That is why **email and the bell stay on for every critical event**. Push is a speed boost, never the only channel.

---

## 7. Limits and costs

| Service | Free allowance | Our usage |
|---|---|---|
| Resend | 3,000 emails/month, 100/day (needs a **verified domain** to send to real users) | About 4 to 6 emails per booking, fine for the pilot |
| Supabase Realtime | Free tier connections are plentiful for a pilot | One channel per logged-in tab |
| Supabase `pg_cron` / `pg_net` | Included | 2 jobs |
| Web push | Free | Only the browser vendor's push service |
| Vercel Hobby | Cron once a day only | Not used; `pg_cron` handles timing |

- **Resend before you have a domain:** it only sends to your own account email. Test with that, then verify the domain (SPF and DKIM records) before real users arrive.
- **Daily email cap:** `NOTIFY_DAILY_EMAIL_CAP=80` skips non-critical emails past 80 a day. Critical ones always go.
- **Housekeeping:** delete read notifications older than 90 days (`pg_cron`, weekly) to save database space on the free tier.

---

## 8. Anti-spam rules

1. One alert per event: transitions fire once, and reminders use `dedupe_key`.
2. The 6-hour reminder goes out once, never repeated.
3. Same `tag` for push replaces the older alert on the phone.
4. Users can mute non-critical types and turn off email or push entirely.
5. Critical types (payment verified or rejected, proof to verify, account decision, cancellations, low credits) cannot be muted.
6. Don't alert a person about their own action.

---

## 9. Build order

**Phase 1: bell + email**

- [ ] Migration: tables, RLS, `notify()`, `notify_admins()`, `mark_notifications_read()`
- [ ] Booking trigger (`notify_booking_events`) and a manual test of each status change
- [ ] Notifications from server actions: document approve/reject, top-up request/decision, QR upload/decision, customer pending review
- [ ] Bell component in all three layouts + `/notifications` + `/notifications/settings`
- [ ] Resend account, domain verification, `renderEmail`
- [ ] `/api/notifications/dispatch` + Database Webhook + sweep job
- [ ] Reminder function + `pg_cron` schedule
- [ ] Test checklist below

**Phase 2: web push**

- [ ] VAPID keys, `public/sw.js`, headers, `proxy.ts` exclusions
- [ ] `push_subscriptions` API routes + enable/disable button + iOS helper
- [ ] `sendPush` in dispatch
- [ ] "Turn on phone alerts" banner for owners and admin; optional prompt for customers
- [ ] Test on a real Android phone and a real iPhone (installed PWA)

---

## 10. Test checklist

- [ ] Customer creates a booking: the owner's bell updates without a refresh, and the owner gets an email
- [ ] Customer uploads proof: owner gets the critical alert (bell + email)
- [ ] Owner verifies: customer gets "Booking confirmed"
- [ ] Owner rejects: customer gets "Payment proof rejected", re-uploads, owner is alerted again
- [ ] Booking left unpaid: the 2-hour warning arrives once, then "expired"
- [ ] Proof unverified for 6 hours: owner and admin are alerted once, not every 10 minutes
- [ ] Customer cancels: owner is notified, customer is not told about their own action
- [ ] Muting a non-critical type stops its email and push but keeps the bell entry
- [ ] A critical alert still arrives when the user has turned email off
- [ ] A user can't read another user's notifications (try with two accounts)
- [ ] Email failure: `delivery_error` is filled and the sweep retries up to 3 times
- [ ] Push: expired subscription (410) is removed; no crash
- [ ] iPhone: the enable button is hidden until the app is on the Home Screen

---

## 11. Definition of done

1. Every event in section 3 produces a bell entry for the right user.
2. Critical events also reach the user by email, even with push off or unsupported.
3. No duplicate alerts after a retry or a repeated cron run.
4. Owners and admin on Android or an installed iPhone app receive push for new bookings and proof uploads.
5. Free-tier limits are not exceeded in a 1-month pilot.
