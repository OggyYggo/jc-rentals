# Kuyog Bohol — Admin Email Alerts to kuyogbohol@gmail.com (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Supabase Postgres + RLS, Resend, Vercel).
**Goal:** every **important update on the admin side** also arrives as an email in the official inbox **kuyogbohol@gmail.com**: new owner applications, money to review, contact messages, security-sensitive changes, and a daily summary of what is waiting. In-app and push admin notifications keep working as they do today.
**Related specs:** `kuyog-bohol-audit-log.md`, `kuyog-bohol-contact-page-implementation.md`, `kuyog-bohol-pricing-and-plans.md`, `kuyog-bohol-user-onboarding.md`, `kuyog-bohol-security-audit-verified.md`.

---

## 0. What exists today

- `public.notify_admins(p_type, p_title, p_body, p_url, p_channels default '{in_app,push}', p_critical, p_dedupe)` loops over every admin profile and calls `notify(...)`. Today admin events (customer documents pending, top-up requested, owner application events) use **in-app and push only**. **No admin email is sent.**
- Email delivery for a notification row is done in `app/api/notifications/dispatch/route.ts`: a Supabase Database Webhook (and a `?sweep=1` retry call) posts the row, the route looks up the **recipient's own account email** (`db.auth.admin.getUserById`) and sends it with Resend using `RESEND_TEMPLATE_ID` (variables `TITLE`, `BODY`, `BUTTON_LABEL`, `BUTTON_URL`, `SETTINGS_URL`). The route checks `x-webhook-secret` (`NOTIFY_WEBHOOK_SECRET`).
- `notify` / `notify_admins` are executable only by `service_role` (and from triggers).
- Env vars already used: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_TEMPLATE_ID`, `NOTIFY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- Admin pages: `/admin` overview, `owner-applications`, `customers`, `owners`, `topups`, `payments`, `bookings`, `cars`, `fees`, `commissions`, `promotions`, `settings`.

**Why a separate pipeline:** the current path emails each admin's *own* account address. This feature needs **one shared inbox**, with per-event rules, a daily digest, throttling and its own settings. Keep it separate from per-user notifications so nothing about customer or owner emails changes.

## 1. Decisions

| Topic | Decision |
|---|---|
| Recipient | `kuyogbohol@gmail.com`, **never hard-coded**: read from `ADMIN_ALERT_EMAIL` (env) and overridable in `/admin/settings` (stored in the database, up to 5 addresses) |
| Sender | A verified **own-domain** address in `EMAIL_FROM` (for example `Kuyog Bohol <alerts@yourdomain.com>`). A `gmail.com` address cannot be the Resend sender. A Gmail address is fine as a **recipient** |
| Delivery modes per event | **Instant**, **Daily digest**, or **Off**, set by the admin in settings with sensible defaults |
| Content | Short and plain. **No personal data beyond a display name**, no phone, email, ID numbers, document links or signed URLs. The button links to the admin page (needs login) |
| Noise control | Dedupe per event and record; at most 20 instant emails per hour, extras roll into the digest; failed sends retry 3 times then stop |
| Failure handling | A failed alert email never blocks the business action. Failures are shown in `/admin/settings` and as an in-app admin notice (never as another email, to avoid loops) |

## 2. Events and defaults

| Event key | Label | When | Default |
|---|---|---|---|
| `application.submitted` | New owner application | a guest submits `/apply` | **Instant** |
| `topup.requested` | Owner top-up to review | owner submits a credit top-up proof | **Instant** |
| `plan.payment_submitted` | Plan payment to review | owner submits a plan payment (when plans exist) | **Instant** |
| `contact.message` | New contact message | someone sends `/contact` | **Instant** |
| `owner.qr_submitted` | Owner payment QR to verify | owner adds or changes the payment QR | Digest |
| `customer.docs_submitted` | Customer documents to review | customer uploads license or ID | Digest |
| `security.commission_changed` | Commission or fee terms changed | `owners.commission_rate`, `fee_mode`, `deposit_percent` changed | **Instant** |
| `security.owner_status_changed` | Owner activated or deactivated | `owners.is_active` changed | **Instant** |
| `security.admin_role_changed` | Admin access changed | `profiles.role` changed to or from `admin` | **Instant** |
| `security.settings_changed` | Platform settings changed | `settings` rows changed | **Instant** |
| `security.alert_recipient_changed` | Alert recipients changed | recipients edited | **Instant** (also sent to the **old** address) |
| `system.delivery_failures` | Notification delivery problems | 5 or more failed deliveries in the last hour | **Instant** (in-app only if the alert email itself is failing) |
| `plan.expiring` | Owner plans expiring | plans ending within 7 days (when plans exist) | Digest |
| `audit.exported` | Audit log exported | an admin exports the audit log | Digest |

Rules:
- The admin can change each event between Instant, Digest and Off in settings. Security events cannot be turned **Off** (only Instant or Digest).
- Events not in this table do **not** send email in v1. Add new ones by adding a row to the rules table and one call site.

## 3. Daily digest

- Sent **every day at 8:00 AM Asia/Manila** (00:00 UTC) to the recipients.
- Subject: `[Kuyog Bohol Admin] Daily summary: {n} things need attention` (or `Daily summary: all caught up` when the admin enabled "also send when nothing is waiting").
- Sections (skip a section when empty):
  1. **Waiting for you** (live counts with links): owner applications pending, owner QRs to verify, top-ups to review, customer documents to review, payments to confirm, plan payments (if any), contact messages new, with the age of the oldest item (*oldest: 2 days*).
  2. **Yesterday**: new bookings, confirmed bookings, cancelled or expired, total booked value, commission earned (use the same definitions as the admin overview).
  3. **Digest events**: the queued digest events since the last digest (grouped by event with counts).
  4. **Heads up**: plans expiring in 7 days, owners with low or zero credits, failed notification deliveries in the last 24 hours.
- Default: send only when section 1 or 3 or 4 has something; a setting turns on "send even when nothing is waiting".
- A weekly summary (Mondays) is **out of scope for v1**.

## 4. Database (migration `202611200002_admin_email_alerts.sql`)

```sql
create table public.admin_alert_config (
  id boolean primary key default true check (id),          -- single row
  recipients text[] not null default '{}'
    check (cardinality(recipients) <= 5 and array_to_string(recipients, ',') !~ '[\s;]'),
  digest_enabled boolean not null default true,
  digest_even_if_empty boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.admin_alert_config default values;

create table public.admin_alert_rules (
  event_key text primary key,
  label text not null,
  mode text not null check (mode in ('instant','digest','off')),
  default_mode text not null check (default_mode in ('instant','digest')),
  locked boolean not null default false                    -- security events: cannot be 'off'
);
-- seed with the table in section 2; locked = true for event keys starting with 'security.'

create table public.admin_alert_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_key text not null references public.admin_alert_rules(event_key),
  title text not null check (char_length(title) <= 140),
  body text check (char_length(body) <= 600),
  url text check (url is null or url ~ '^/admin(/|$)'),     -- internal admin links only
  dedupe_key text unique,
  status text not null default 'pending' check (status in ('pending','digest','sent','digested','failed')),
  attempts int not null default 0,
  sent_at timestamptz,
  last_error text
);
create index admin_alert_queue_status_idx on public.admin_alert_queue (status, created_at);

-- RLS: admins read; nobody writes directly
alter table public.admin_alert_config enable row level security;
alter table public.admin_alert_rules enable row level security;
alter table public.admin_alert_queue enable row level security;
revoke all on public.admin_alert_config, public.admin_alert_rules, public.admin_alert_queue from anon, authenticated;
grant select on public.admin_alert_config, public.admin_alert_rules, public.admin_alert_queue to authenticated;
create policy "Admins read alert config" on public.admin_alert_config for select to authenticated using (public.is_admin());
create policy "Admins read alert rules"  on public.admin_alert_rules  for select to authenticated using (public.is_admin());
create policy "Admins read alert queue"  on public.admin_alert_queue  for select to authenticated using (public.is_admin());
```

Writer function (called from triggers, definer functions and, through the service role, from server code):

```sql
create or replace function public.admin_alert(
  p_event_key text, p_title text, p_body text default null, p_url text default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_mode text;
begin
  select mode into v_mode from public.admin_alert_rules where event_key = p_event_key;
  if v_mode is null or v_mode = 'off' then return; end if;
  insert into public.admin_alert_queue(event_key, title, body, url, dedupe_key, status)
  values (p_event_key, left(p_title,140), left(p_body,600), p_url, p_dedupe,
          case v_mode when 'instant' then 'pending' else 'digest' end)
  on conflict (dedupe_key) do nothing;
end $$;
revoke all on function public.admin_alert(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_alert(text,text,text,text,text) to service_role;
```

Settings writers (admin only, definer, `search_path = public`, revoked from `public, anon`, granted to `authenticated`, each calls `is_admin()` first):
- `admin_set_alert_recipients(p_recipients text[])`: lowercases, validates each address (simple regex and length ≤ 120), 1 to 5 unique addresses, writes the config row, calls `audit_write` (audit log spec), queues `security.alert_recipient_changed` with the **masked** old and new address (`k***@gmail.com`), and returns the **previous** recipients so the app can send the notice to the old address too.
- `admin_set_alert_rule(p_event_key text, p_mode text)`: refuses `off` for locked rows, logs to the audit log.
- `admin_set_alert_digest(p_enabled boolean, p_even_if_empty boolean)`.

Hook points (add `perform public.admin_alert(...)` **next to** the existing `notify_admins` calls so behavior stays in sync):

| Event | Where |
|---|---|
| `topup.requested` | `notify_topup_events` (migration `202611110002`) |
| `customer.docs_submitted` | `notify_profile_review_events` |
| `owner.qr_submitted` | trigger or function that already handles `payment_qr_path` changes on `owners` |
| `security.*` | the **audit log triggers**: when `audit_row_change` writes an `owner.updated` row whose changes include `commission_rate`, `fee_mode`, `deposit_percent`, `is_active` or `payment_qr_verified`, or a `profile.updated` row changing `role`, or any `settings` change, call `admin_alert` with the summary text. (If the audit log is not built yet, add small dedicated triggers on those columns.) |
| `application.submitted` | `app/apply/actions.ts` after the application row is saved (service role RPC `admin_alert`) |
| `contact.message` | `app/contact/actions.ts` after the message row is saved |
| `plan.payment_submitted`, `plan.expiring` | plans spec triggers and the daily plan job |

Dedupe keys: `event_key + ':' + record id` (for repeated changes of the same record within a day append the date). Never include personal data in `title` or `body`: use *"New owner application from {business name}"*, *"A customer submitted documents"*, *"Commission changed for {business name}: 5% → 3%"*.

Triggers are `after` triggers and must never raise: wrap the `admin_alert` call in the calling function with a `begin ... exception when others then null; end;` block so an alert problem can never block bookings or approvals (this is the **one** place errors are swallowed; the audit log stays fail-closed).

## 5. Sending (server code)

### 5.1 Instant: `app/api/admin-alerts/dispatch/route.ts`
- `POST`, called by a **Supabase Database Webhook on `admin_alert_queue` inserts** (only for `status = 'pending'`), and with `?sweep=1` by the existing retry mechanism (pg_cron + pg_net, same pattern as notifications).
- Authenticate with `x-webhook-secret` using the **timing-safe comparison** from the security audit (`crypto.timingSafeEqual`, equal-length check). Exclude the route from the `proxy.ts` matcher the same way as `api/notifications/dispatch`.
- Load recipients: `admin_alert_config.recipients`, or `ADMIN_ALERT_EMAIL` (comma separated) when the table row is empty. If there are none, mark rows `failed` with `last_error = 'No recipients configured'` and stop.
- **Throttle:** if more than 20 rows were `sent` in the last 60 minutes, set the row to `status = 'digest'` instead of sending (it will appear in the next digest).
- Send one email per queue row through Resend (`https://api.resend.com/emails`):
  - `from`: `EMAIL_FROM`; `to`: the recipients; subject `[Kuyog Bohol Admin] {title}`.
  - Body: reuse `RESEND_TEMPLATE_ID` with `TITLE`, `BODY`, `BUTTON_LABEL = "Open in admin"`, `BUTTON_URL = NEXT_PUBLIC_SITE_URL + url`, `SETTINGS_URL = NEXT_PUBLIC_SITE_URL + /admin/settings`. If the template does not fit, build a small HTML email in code with inline styles and **escaped** text.
  - Use an idempotency key (`Idempotency-Key: queue id`) so a retried webhook does not send twice.
- On success set `status = 'sent'`, `sent_at`; on failure increment `attempts`, store a **short sanitized** `last_error` (no API keys, no full response bodies), and after 3 attempts set `failed`.
- Sweep (`?sweep=1`): re-send `pending` rows with `attempts < 3` created in the last 24 hours (limit 50).

### 5.2 Daily digest: `app/api/admin-alerts/digest/route.ts`
- `GET`, called once a day at `0 0 * * *` UTC (8:00 Manila) by **Vercel Cron** (`vercel.json`) with `Authorization: Bearer ${CRON_SECRET}` (check current Vercel plan limits for cron frequency and use pg_cron + pg_net instead if needed). Verify the secret with a timing-safe compare; reject otherwise.
- Build the digest with the **service role** (counts and queue rows only), render an HTML email (inline CSS, escaped text, Inter or system sans, brand blue `#0B63CE` header, one button **Open admin dashboard**), send to the recipients, then mark the included `digest` rows `digested`.
- Idempotent per day: skip if a digest was already sent today (store `last_digest_on date` in `admin_alert_config`, add the column).
- Live counts use the same queries as the admin overview and the **Needs attention** panel (onboarding spec), so the numbers match what the admin sees.

### 5.3 Test email and recipient change (server actions)
- `sendTestAlert()` (admin only, rate limit 3 per hour per admin): sends a clearly labelled test to the current recipients; result shown with a toast.
- When recipients change: after `admin_set_alert_recipients` returns the previous list, send a **notice to the previous addresses** (*"Admin alert recipients were changed by {admin name}. New recipient: k***@gmail.com. If this was not you, sign in and review the audit log."*) and an in-app notice to all admins (`notify_admins`). Then send a test email to the new recipients. This prevents silent redirection of alerts.

## 6. Admin UI

**`/admin/settings` → new section "Email alerts"** (new component `components/admin/alert-settings.tsx`; match the existing settings form style):
- **Recipients:** list of 1 to 5 emails (chips), add and remove, inline validation, helper *Alerts are sent to these addresses. Use a shared inbox that is protected with two-step verification.* Saving asks for confirmation (SweetAlert helper if present) and shows what will happen (notice to old address, test to new).
- **Send test email** button with success and error toast; shows *Last email sent {time}* and *Failed in the last 24 hours: n*.
- **Event rules table:** each event with a segmented control **Instant | Daily digest | Off** (Off disabled for security events with a lock icon and the text *Always on*), a short description, and the default marked.
- **Digest:** toggle *Send a daily summary at 8:00 AM*, toggle *Also send when nothing is waiting*.
- **Delivery status:** latest 10 queue rows (event, time, status chip *Sent / Waiting / Failed*, error text if failed) with **Retry** for failed rows (admin RPC that sets `status = 'pending'`, attempts 0).
- All changes are written through the RPCs above (audit logged). Mobile layout at 390px must not scroll horizontally.
- Add a small **Email alerts** status chip on `/admin` (*On · kuyogbohol@gmail.com masked* or *Not configured*) linking to the section.

## 7. Configuration and Gmail setup (checklist for the owner, not code)

Environment variables (Vercel and local `.env.example`, **empty values**, never commit real ones):

```
ADMIN_ALERT_EMAIL=kuyogbohol@gmail.com
EMAIL_FROM=Kuyog Bohol <alerts@yourdomain.com>
RESEND_API_KEY=
RESEND_TEMPLATE_ID=
NOTIFY_WEBHOOK_SECRET=
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=
```

Manual steps:
1. **Domain:** verify a domain in Resend (SPF, DKIM, DMARC). Without a verified domain, Resend's test sender can only deliver to the email that owns the Resend account (check Resend's current docs). If the Resend account was created with `kuyogbohol@gmail.com`, alerts can be tested to that inbox before the domain is ready.
2. **Secure the Gmail account:** turn on two-step verification (authenticator app or passkey), add a recovery phone and email, and do not reuse the password. This inbox receives admin alerts and may receive password reset mail, so treat it like an admin account.
3. **Gmail filter:** create a filter for the sender address: **never send to spam**, apply the label *Kuyog Bohol Admin*, mark important. This avoids the first alerts landing in Spam.
4. **Webhook and cron:** create the Database Webhook on `admin_alert_queue` inserts to `/api/admin-alerts/dispatch` with the `x-webhook-secret` header; add the pg_cron sweep and the Vercel cron for the digest.
5. **Redundancy:** consider adding a second recipient (another trusted person) so one inbox is not a single point of failure. In-app and push admin notifications continue as a backup.

## 8. Security and privacy

- Alerts carry **minimal data**: event, a display name, a count, a link. No contact details, no document or proof links, no signed URLs, no tokens.
- Internal links only (`/admin/...`, enforced by a check constraint and by the sender code). The admin must sign in to see details.
- All dynamic text is **escaped** in HTML emails; subjects and bodies have length limits; header values contain no newlines.
- `admin_alert` and the queue are service-role and definer only; the RPCs that change settings check `is_admin()` and write to the audit log; `anon` has no EXECUTE on anything new.
- Webhook and cron endpoints use secrets with **timing-safe comparison**; errors returned to callers are generic.
- Recipient changes notify the previous address and all admins and are audit logged. Security events cannot be switched off.
- Store only sanitized error text (no API keys, no full third-party responses).
- The shared inbox is a sensitive asset: keep it admin-only, protected by two-step verification, and review who has access to it.

## 9. Test plan

SQL (with role switching and JWT claims):
1. `admin_alert('application.submitted', ...)` with mode instant → one `pending` row; with mode digest → `digest`; with `off` → no row; unknown event key → no row.
2. Same `dedupe_key` twice → one row.
3. `url` that does not start with `/admin` → insert rejected.
4. Anonymous and authenticated (non-service) users cannot execute `admin_alert`; non-admin cannot read the queue or call the settings RPCs; admin sets recipients with 6 addresses or an invalid address → rejected.
5. `admin_set_alert_rule('security.settings_changed','off')` → rejected (locked).
6. Changing `owners.commission_rate` creates a `security.commission_changed` queue row (and an audit row if the audit log exists); a failing `admin_alert` does **not** block the update.
7. Recipient change returns the previous list and creates the masked security alert.

App and integration:
- Webhook with a wrong or missing secret → 401; with the right secret sends one email and marks the row `sent`; retry of the same webhook does not send twice (idempotency key).
- Resend failure → `attempts` increases, sanitized `last_error`, after 3 attempts `failed`; sweep retries only rows under 3 attempts.
- Throttle: 25 instant rows in an hour → 20 sent, 5 moved to the digest.
- Digest: with pending items it sends once per day; running twice the same day sends once; nothing waiting and the toggle off → no email; counts match the admin overview.
- Test email button respects the rate limit; recipient change sends the old-address notice and a test to the new address.
- HTML injection test: a business name like `<img src=x onerror=alert(1)>` appears as plain text in the email and in settings.
- Settings UI at 390px works; Off is disabled for security events; delivery status list updates after **Retry**.
- Existing notification flows (customer, owner, admin in-app and push) behave exactly as before.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 10. Build order (one commit per step)

1. Migration: tables, seed rules, `admin_alert`, settings RPCs, RLS and grants; SQL tests 1 to 7.
2. Hook the existing triggers (top-up, customer documents, owner QR) and the security events; add `ADMIN_ALERT_EMAIL` to `.env.example`.
3. `app/api/admin-alerts/dispatch` with throttle, retries, idempotency and timing-safe secret check.
4. Application and contact message call sites.
5. `/admin/settings` Email alerts section: recipients, test email, rules, delivery status, recipient-change notice.
6. Daily digest route, `vercel.json` cron (or pg_cron), digest email template and the `last_digest_on` guard.
7. Final pass: security checklist, accessibility, mobile layout, error and loading states.

## 11. Acceptance checklist

- [ ] An email arrives at `kuyogbohol@gmail.com` within about a minute of: a new owner application, a top-up request, a contact message, and each security event.
- [ ] Digest events and counts arrive in one email each morning at 8:00 AM Manila time, only once per day.
- [ ] The recipient comes from configuration (env and settings), is never hard-coded in code, and supports up to 5 addresses.
- [ ] Emails are sent from the verified own-domain address; no `gmail.com` sender is used.
- [ ] Emails contain no phone numbers, emails, ID numbers, document links or signed URLs; links point to `/admin/...` only.
- [ ] Throttling, dedupe, retries and the failed state work; a failing alert never blocks a business action.
- [ ] Admins can change recipients, send a test, set each event to Instant, Digest or Off (security events locked), see delivery status and retry failures.
- [ ] Changing recipients notifies the old address and all admins and is audit logged.
- [ ] Webhook and cron endpoints are protected with timing-safe secret checks; no new anonymous EXECUTE.
- [ ] Existing in-app, push and customer or owner email notifications are unchanged.
- [ ] Lint, typecheck, build and the tests above pass.

## 12. Codex prompt

*"Implement admin email alerts following `kuyog-bohol-admin-email-alerts.md`. First read `app/api/notifications/dispatch/route.ts`, the notification migrations (`notify`, `notify_admins`, `notify_topup_events`, `notify_profile_review_events`), `app/admin/settings`, `app/apply/actions.ts` and the contact page action, and follow their patterns. Build in the order of section 10. Keep this pipeline separate from per-user notifications. Read recipients from configuration, never hard-code any address. Keep email content minimal (no personal data, no document links). Use timing-safe secret comparison on webhook and cron routes. Never let an alert failure block a business action. Never print or commit secrets. Run lint, typecheck, build and the SQL tests, and list anything you could not verify, including the manual Gmail, Resend domain, webhook and cron setup in section 7."*
