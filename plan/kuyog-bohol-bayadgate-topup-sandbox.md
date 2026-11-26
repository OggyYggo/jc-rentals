# Kuyog Bohol — Online Owner Credit Top-up via BayadGate (SANDBOX / TEST ONLY) (Instructions for Codex)

Adds an optional "Pay online" way for owners to top up credits (GCash, Maya, GoTyme through BayadGate). The existing manual QR top-up (proof upload + admin review) **stays exactly as it is** and remains the default. Customer booking deposits are **not** part of this: they stay owner-direct.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers or server actions.

> BayadGate's public docs are thin (MD5 signatures, no timestamp, no documented sandbox, `query_status` response not documented). This is a **test integration behind a feature flag**. Do not enable it in Production.

## Security rules (must follow)
- Secrets only in server env vars, never `NEXT_PUBLIC_*`, never logged, never in client code, never in git. Add placeholders to `.env.example`:
  `BAYADGATE_ENABLED=` (`1` to turn on), `BAYADGATE_BASE_URL=https://BayadGate.com/api`, `BAYADGATE_MERCHANT_ID=`, `BAYADGATE_SECRET_KEY=`, `BAYADGATE_TOPUP_MAX=5000`.
- Never call BayadGate `payout.php` from the app. Withdrawals are done by hand in their dashboard.
- Credits are added **only** by the server after the callback passes every check below. The browser redirect (`redirect_url`) never adds credits.
- Do not change payment, booking, commission or the existing top-up approval logic.

## 0. Look at the code first and report
Open `app/owner/credits/page.tsx`, `components/owner/credits.tsx`, `components/owner/credit-state.tsx`, `app/admin/topups/page.tsx`, `components/admin/payment-admin.tsx`, the `owner_credit_ledger` table and `admin_review_owner_topup` in `202611060003_payment_qr_module.sql` (note the unique index `ledger_topup_reference_unique` on topup `reference_no`), how other server routes read the service key (`SUPABASE_SECRET_KEY`, `lib/supabase/*`), `app/api/payments/*`, and the audit helpers (`audit_write`). Report differences.

## 1. Database (one migration)
- Table `public.gateway_topups`: `id uuid pk default gen_random_uuid()`, `order_id text unique not null` (format `KBT-` + 12 random chars), `owner_id uuid not null references owners(id)`, `provider text not null default 'bayadgate'`, `method text check (method in ('GCASH','MAYA','GOTYME'))`, `amount numeric(12,2) not null check (amount > 0)`, `status text not null default 'created' check (status in ('created','paid','failed','expired'))`, `payment_url text`, `ledger_id uuid references owner_credit_ledger(id)`, `callback_count int not null default 0`, `last_callback_at timestamptz`, `created_at timestamptz default now()`, `paid_at timestamptz`.
- RLS on; owners can `select` their own rows only; **no insert/update/delete for `authenticated`**. Only the server (service role) writes.
- Function `public.post_gateway_topup(p_order_id text, p_amount numeric)`: `security definer`, `set search_path = ''`, `execute` granted to `service_role` only (revoke from public/anon/authenticated). In one transaction: lock the `gateway_topups` row `for update`; if status is already `paid` return `already_paid`; require `status = 'created'` and `amount = p_amount` (else raise); insert into `owner_credit_ledger` (`type 'topup'`, `status 'posted'`, `amount`, `reference_no = order_id`, `note 'Online top-up (BayadGate)'`, no proof); set the gateway row `paid`, `paid_at`, `ledger_id`; `audit_write('topup.gateway_paid', ...)`. The unique topup reference index makes a double credit impossible even if two callbacks race.
- Check the credit state functions count `posted` topups the same way as admin-approved ones; report if not.
- Follow the repo's migration naming and grant-lockdown pattern (`..._lock_down_function_grants.sql`).

## 2. Server code
- `lib/payments/bayadgate.ts` (server-only, `import "server-only"`): 
  - `sign(params)`: drop empty values and `sign`, sort keys alphabetically, join `k=v` with `&`, append `&key=` + secret, MD5, lowercase hex.
  - `verifySign(params)`: recompute and compare with `crypto.timingSafeEqual`.
  - `createPayment({ orderId, amount, method, redirectUrl })`: `POST {BASE}/checkout.php` form or JSON exactly as the docs/portal say (fields: `merchant_id`, `amount` with 2 decimals, `order_id`, `payment_method`, `redirect_url`, `sign`); timeout 10s; return `payment_url` or throw a friendly error. If the portal documents form-encoding vs JSON, follow it and report which.
  - `queryStatus(orderId)`: `POST {BASE}/query_status.php` signed. **The response format is undocumented**: implement it defensively, log nothing sensitive, and if the response cannot be understood treat it as "unknown" (see callback step 6). Report what the real response looks like in sandbox.
- Server action or route `POST /api/payments/bayadgate/create` (owner session required, owner must be active, feature flag on): validate `amount` (whole pesos, min = the owner's existing minimum top-up, max `BAYADGATE_TOPUP_MAX`) and `method`; create the `gateway_topups` row (service role), call `createPayment`, store `payment_url`, return it. Rate limit per owner (for example 5 per 10 minutes) using the same approach as other routes in the repo (report if none exists and add a simple DB-count check).
- Route `POST /api/payments/bayadgate/callback` (public, no session):
  1. If the flag is off return 404.
  2. Parse fields `merchant_id`, `order_id`, `amount`, `status`, `sign` (form or JSON per docs). Never log the secret or the full signed string.
  3. Reject unless `merchant_id` equals ours and `verifySign` passes (respond 400, not `SUCCESS`).
  4. Load the `gateway_topups` row by `order_id`; unknown order → 400.
  5. Require `status` to be the success value (`5` per docs) and the callback `amount` to equal the stored amount to 2 decimals.
  6. Call `queryStatus(order_id)` to confirm. If it clearly says paid, continue. If it clearly says not paid, respond 400. If the response is unknown/unparseable, **do not credit**: mark `callback_count`, keep the row `created`, flag it for admin review, respond 400 so BayadGate retries (max 5), and show it in the admin list as "Needs review".
  7. Call `post_gateway_topup(order_id, amount)`. On success or `already_paid`, respond with plain text `SUCCESS` and HTTP 200 (this is what BayadGate expects, otherwise it retries 5 times).
  8. Notify the owner with the existing notification helper ("Credits added").
  - Process each `order_id` at most once; replays return `SUCCESS` without crediting again. Add basic request-size limit.
- Expiry: rows still `created` after 2 hours become `expired` by the existing cron pattern or a lazy check when the owner opens the credits page; never credit an expired row from a late callback without admin review.

## 3. Owner UI (mobile first; keep desktop layout otherwise unchanged)
On the owner credits page (`components/owner/credits.tsx`), above the existing manual form:
- Card "Pay online" (only if `BAYADGATE_ENABLED=1`): amount chips (₱500, ₱1,000, ₱2,000, custom), method buttons (GCash, Maya, GoTyme), primary **Continue to payment** (redirects to `payment_url`), note "Credits are added after the payment is confirmed. Usually a few minutes."
- Secondary link "Pay by QR and upload proof instead" scrolls to the existing manual form (unchanged).
- Return page: `redirect_url` = `/owner/credits?topup={order_id}`; show a status card (Waiting for confirmation with a 5-second refresh for up to 2 minutes, Credits added, or Not completed) reading the owner's own `gateway_topups` row. Do not credit from this page.
- Credits history shows online top-ups with the note and a "Paid online" chip.
- Friendly errors only; buttons show spinners and disable while working.

## 4. Admin UI
In the Top-ups page add a small "Online top-ups" section (read-only table/cards): order id, owner, amount, method, status (Created, Paid, Needs review, Expired), time. No approve/reject buttons here; "Needs review" rows show a note to check the BayadGate dashboard and use the existing manual **Adjust credits** if the payment really arrived. Audit log labels for `topup.gateway_paid`.

## 5. Tests (sandbox, Vercel Preview or local with a public tunnel; flag on only there)
1. Flag off: no "Pay online" card, callback returns 404.
2. Create a ₱500 top-up, complete the sandbox payment: callback arrives, signature verifies, credits increase by exactly ₱500 once, owner is notified.
3. Replay the same callback 3 times: credits do not increase again; response is still `SUCCESS`.
4. Tampered `amount`, wrong `merchant_id`, bad `sign`, unknown `order_id`, status not success: nothing credited, no `SUCCESS` returned.
5. `queryStatus` returns something unparseable: nothing credited, row shows "Needs review".
6. Owner A cannot read or create rows for owner B; `authenticated` clients cannot insert/update `gateway_topups` or call `post_gateway_topup`.
7. Amount rules: centavos rejected, below minimum and above `BAYADGATE_TOPUP_MAX` rejected.
8. Manual QR top-up still works untouched; admin approval path unchanged.
9. No secret appears in client bundles, logs or error messages (search the build output for the key name and value).
10. `npm run lint`, `npx tsc --noEmit`, `npm run build`. List anything you could not verify, especially the real `checkout.php`/`query_status.php` response formats.

## Out of scope
Customer deposits, payouts/withdrawals via API, QuickPay or other gateways (keep `lib/payments/bayadgate.ts` isolated so a provider can be swapped), production rollout, refunds of online top-ups.

## Codex prompt
*"Read `kuyog-bohol-bayadgate-topup-sandbox.md`. First report how owner credits, the top-up ledger and admin top-ups work today. Then implement the sandbox-only BayadGate online top-up behind `BAYADGATE_ENABLED`: the migration (`gateway_topups`, service-role-only `post_gateway_topup`), the isolated BayadGate helper with MD5 signing and constant-time verification, the create and callback routes with all checks, the owner 'Pay online' UI and return status, and the read-only admin list. Keep the manual QR top-up unchanged, never credit from the browser redirect, never call payouts, and keep all secrets server-side. Run lint, typecheck and build, run the tests in section 5, and list anything you could not verify."*
