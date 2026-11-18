# Kuyog Bohol (jc-rentals) — Code-Verified Security Audit

**Repo:** `OggyYggo/jc-rentals` @ `e807fb8` · **Date:** 2026-11-18
**Method:** read every migration (RLS, grants, triggers, SECURITY DEFINER functions, storage), all API routes, auth routes, `proxy.ts`, `next.config.ts`, `package.json`, secret grep, `npm audit`.
**Not done:** I could not run the live database, so items marked *VERIFY* need one SQL query on Supabase.

Supersedes the doc-only `kuyog-bohol-security-audit.md`. Several risks in that file are **already fixed in your code** (see section 3).

---

## 1. Summary

The core of the app is built well. Money, roles and ownership are enforced in the database (column grants, triggers, definer functions with guards), not only in the UI. There are **no critical findings** and no secrets in the repo.

| # | Severity | Finding | Status |
|---|---|---|---|
| A1 | **High** | `notify()` / `notify_admins()` not revoked from `anon` (default Supabase grant) | VERIFY, then fix |
| A2 | **Medium** | No security headers or CSP (`next.config.ts`) | Fix |
| A3 | **Medium** | `shadcn` CLI in `dependencies` pulls 10 npm audit vulns into the prod install | Fix |
| A4 | **Medium** | `owners` table still has table-level `INSERT/UPDATE/DELETE` for `authenticated` | Tighten |
| A5 | **Low** | Dispatch webhook secret compared with `!==` (not timing-safe) | Fix |
| A6 | **Low** | `NOTIFY_WEBHOOK_SECRET` and `RESEND_TEMPLATE_ID` missing from `.env.example` | Fix |
| A7 | **Low** | Anon can execute other definer RPCs (all self-guarded, but widen surface) | Tighten |
| A8 | **Low** | `carId` not validated as UUID in car-photos route; PDF accepted by magic bytes only | Harden |
| A9 | **Low** | `/c/[code]` inserts a `promo_clicks` row per hit with no throttle | Harden |
| A10 | Info | Public repo contains `AGENTS.md`, `plan/`, `PROJECT_OVERVIEW.md` | Review |

---

## 2. Findings and fixes

### A1 — `notify()` callable by anonymous users (High, verify)
**Evidence:** `202611110001_notifications.sql` lines 65 and 71:
`revoke all on function public.notify(...) from public, authenticated;`
Supabase grants EXECUTE on new functions to `anon` and `authenticated` through default privileges. `revoke ... from public` does not remove those. The revoke covers `authenticated` but **not `anon`**. If the grant is still there, anyone without an account can call `POST /rest/v1/rpc/notify` with any `p_user`, title, body and `p_channels = {email,push}`. Impact: fake in-app, email and push notifications to any user (phishing through your Resend sender and branded template), and Resend quota burn.

**Verify (Supabase SQL editor):**
```sql
select grantee, privilege_type from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('notify','notify_admins');
```
If `anon` appears, apply the fix.

**Fix (new migration `202611180001_lock_down_function_grants.sql`):**
```sql
revoke all on function public.notify(uuid,text,text,text,text,uuid,text[],boolean,text) from public, anon, authenticated;
revoke all on function public.notify_admins(text,text,text,text,text[],boolean,text) from public, anon, authenticated;
grant execute on function public.notify_admins(text,text,text,text,text[],boolean,text) to service_role;

-- Trigger functions never need to be called through the API
revoke all on function public.notify_booking_events() from public, anon, authenticated;
revoke all on function public.notify_profile_review_events() from public, anon, authenticated;
revoke all on function public.notify_topup_events() from public, anon, authenticated;
revoke all on function public.notify_owner_qr_decision() from public, anon, authenticated;
revoke all on function public.set_booking_owner_and_earnings() from public, anon, authenticated;
revoke all on function public.validate_customer_payment_proof() from public, anon, authenticated;
revoke all on function public.expire_booking_holds_before_insert() from public, anon, authenticated;
revoke all on function public.create_customer_profile() from public, anon, authenticated;
revoke all on function public.mark_customer_documents_pending() from public, anon, authenticated;
```
Triggers keep working because they run as the table owner, not through grants. Test a booking and a signup after applying.

### A2 — No security headers / CSP (Medium)
**Evidence:** `next.config.ts` only sets `Cache-Control` for `/sw.js`.
**Fix:** add to `next.config.ts`:
```ts
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];
// in async headers(): { source: "/(.*)", headers: securityHeaders }, keep the /sw.js entry
```
CSP must allow: `self`; Supabase URL (`img-src`, `connect-src`, `https:`/`wss:`); `https://challenges.cloudflare.com` (script, frame, connect); Next inline scripts (use nonce via `proxy.ts`, or start `'unsafe-inline'` in Report-Only and tighten). **Ship as Report-Only first**, watch for a week, then switch to enforcing. Allow `frame-ancestors 'none'`.

### A3 — `shadcn` in `dependencies` (Medium)
**Evidence:** `npm audit --omit=dev`: 10 vulns (8 high, 2 moderate). All chain from `shadcn` (direct): `@dotenvx/dotenvx`, `fast-glob`, `micromatch`, `picomatch`, `ts-morph`, `minimatch`. `shadcn` is a CLI and should not ship with the production install.
**Fix:** `npm uninstall shadcn && npm i -D shadcn` (or run it with `npx shadcn@latest`). Re-run `npm audit --omit=dev`; expect 0. Add `npm audit --omit=dev --audit-level=high` to CI.

### A4 — `owners` table-level write grants (Medium, defence in depth)
**Evidence:** `202611030003_admin_panel.sql:30` `grant insert, update, delete on public.owners to authenticated`. Currently safe: RLS policies plus trigger `reset_owner_payment_qr_verification` block non-admin changes to commission, fee mode, deposit, active flag and QR verification. But a future policy mistake would expose everything.
**Fix:**
```sql
revoke insert, update, delete on public.owners from authenticated;
grant update (payment_method_label, payment_account_name, payment_qr_path) on public.owners to authenticated;
-- admin writes already go through admin_create_owner / admin_set_owner_payment_* definer functions
```
Check the admin UI does no direct `.from("owners").update/insert/delete` first (`grep -rn 'from("owners")' app`).

### A5 — Webhook secret comparison (Low)
**Evidence:** `app/api/notifications/dispatch/route.ts`: `request.headers.get("x-webhook-secret") !== secret`.
**Fix:**
```ts
import { timingSafeEqual } from "node:crypto";
const given = Buffer.from(request.headers.get("x-webhook-secret") ?? "");
const want = Buffer.from(secret ?? "");
if (!secret || given.length !== want.length || !timingSafeEqual(given, want)) return unauthorized;
```
Also: the route is excluded from the `proxy.ts` matcher on purpose (fine). Use a 32+ byte random secret and rotate if it was ever pasted anywhere.

### A6 — Undocumented env vars (Low)
`NOTIFY_WEBHOOK_SECRET` and `RESEND_TEMPLATE_ID` are used in code but absent from `.env.example`. Add both (empty values) so a deploy does not silently run with email or dispatch disabled.

### A7 — Anonymous EXECUTE on guarded RPCs (Low)
`confirm_booking_payment`, `reject_booking_payment`, `cancel_booking`, `mark_deposit_refunded`, `owner_*`, `admin_*` are revoked from `public` only. I read the bodies: every one checks `auth.uid()` / `is_admin()` / ownership and raises otherwise, so this is **not exploitable today**. Still, revoke `anon` so unauthenticated calls fail at the grant, not in function code:
```sql
revoke execute on function
  public.confirm_booking_payment(uuid), public.reject_booking_payment(uuid,text),
  public.cancel_booking(uuid,text), public.mark_deposit_refunded(uuid),
  public.owner_set_booking_status(uuid, public.booking_status), public.owner_mark_payment_received(uuid,text),
  public.admin_review_owner_topup(uuid,boolean,text), public.admin_set_owner_payment_terms(uuid,text,numeric,numeric),
  public.admin_set_owner_payment_qr_verified(uuid,boolean), public.admin_generate_monthly_invoices(date),
  public.admin_mark_invoice_paid(uuid), public.admin_set_customer_verification(uuid, public.verification_status),
  public.admin_create_owner(uuid,text,numeric), public.cancel_my_booking(uuid),
  public.mark_notifications_read(uuid[]), public.is_admin()
from anon;
-- keep owner_can_accept for anon only if public car pages call it
```

### A8 — Upload route hardening (Low)
- `app/api/owner/car-photos/route.ts`: `carId` goes to the query unvalidated. RLS blocks abuse, but add `z.string().uuid().safeParse(carId)` and return 400.
- `app/api/account/documents/route.ts`: PDFs are checked by the declared type plus `%PDF-` header. Acceptable for a private bucket served by signed URLs. Make sure admins open documents via short-lived signed URLs with `Content-Disposition: attachment`, and that the bucket MIME allow-list (already in migrations) stays.
- Images are re-encoded with `sharp` (strips EXIF and payloads) and pixel-capped. Good.

### A9 — Promo click flooding (Low)
`app/c/[code]/route.ts` writes one `promo_clicks` row per request using the service role. Add a cheap dedupe (same cookie `kb_ref` within 30 min → skip insert) or `rate limit by IP hash`, as you already did for owner applications. Short code regex is strict, no open redirect (redirects use `NEXT_PUBLIC_SITE_URL` + id).

### A10 — Repo exposure (Info)
Repo is public. No secrets found (secret grep: none; `.env*` ignored except `.env.example`; single commit in the clone, but check full history on GitHub: Settings > Code security > secret scanning). Review `plan/`, `PROJECT_OVERVIEW.md` and `AGENTS.md` for anything you would not want competitors or attackers to read (admin flows, business terms). Consider making the repo private. Note `AGENTS.md` asks agents to run a feedback command; remove it if you did not write it.

---

## 3. Verified OK (do not change)

| Area | Result | Evidence |
|---|---|---|
| Role escalation via profile update | PASS | Column grants plus policy `role='customer'` check on `profiles` |
| Customer price tampering | PASS | Insert grant excludes price columns; trigger `set_booking_owner_and_earnings` computes them |
| Payment confirmation | PASS | `confirm_booking_payment` checks owner or admin, status and deadline; `payments` writes only via column-limited insert |
| Owner self-promotion (commission, active, QR verified) | PASS | Trigger `reset_owner_payment_qr_verification` |
| Definer functions `search_path` | PASS | All 33 set `search_path` |
| Auth sessions | PASS | `getClaims()` in proxy, `getUser()` in routes; no `getSession()` trust |
| Open redirects | PASS | `auth/callback` allow-lists 2 paths; `auth/confirm` allow-lists `next`; promo redirects use fixed origin |
| Owner applications | PASS | Anon/authenticated insert revoked, Turnstile, IP-hash rate limit, signed cookie, server zod validation, upload name/size/MIME checks |
| Storage | PASS | Private buckets for docs, QR, proofs; size and MIME limits; paths prefixed with `user.id` |
| Secrets in code | PASS | Only env vars; service key only in `lib/supabase/admin.ts` server side |
| Webhook auth | PASS (see A5) | Required header; 401 otherwise |

---

## 4. Order of work for Codex

1. Run the A1 verify query. Apply the migration (A1 + A7) in one file. Test: signup, create booking, pay, owner confirm, notification delivered.
2. A3 (`shadcn` to devDependencies) and A6 (`.env.example`).
3. A5 (timing-safe compare), A8 (uuid check), A9 (click dedupe).
4. A2 headers in Report-Only, then enforce.
5. A4 grant tightening after grepping for direct `owners` writes.
6. A10 repo review.

**Codex prompt:** *"Implement section 2 of SECURITY_AUDIT_VERIFIED.md in the order of section 4. One commit per finding. Never print or commit secrets. After each change run `npm run lint`, `npx tsc --noEmit`, `npm run build`. Create `SECURITY_REPORT.md` listing each finding with status Fixed / Skipped and why."*

## 5. Manual checks you must do yourself (not visible from code)
- Supabase: Auth > Providers: email confirmation ON, leaked-password protection ON, minimum password length 8+, OTP expiry short; Site URL and Redirect URLs list only your domains.
- Supabase: Database Webhook sends the `x-webhook-secret` header; secret matches Vercel env.
- Vercel: env vars set for Production only where needed; `SUPABASE_SECRET_KEY` never has the `NEXT_PUBLIC_` prefix.
- Supabase: turn on daily backups (or PITR) and test one restore.
- Resend: SPF, DKIM, DMARC verified on your sending domain.
- Cloudflare Turnstile: hostname list limited to your domain.
