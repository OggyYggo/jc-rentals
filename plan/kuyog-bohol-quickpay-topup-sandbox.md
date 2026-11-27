# Kuyog Bohol — Online Owner Credit Top-up via QuickPay (TEST MODE FIRST) (Instructions for Codex)

**This replaces the BayadGate version** (`kuyog-bohol-bayadgate-topup-sandbox.md`). Reuse everything already built that is provider-neutral (the `gateway_topups` table, `post_gateway_topup`, the owner "Pay online" UI, the admin list) and swap the provider. QuickPay's docs: https://quickpayph.com/docs/ (checkouts, webhooks, API keys, OpenAPI at `/docs/openapi.json`). Read them before coding and report any difference from this file.

Adds an optional "Pay online" way for owners to top up credits (GCash, Maya, GoTyme, GrabPay, ShopeePay, QR Ph, banks). The existing manual QR top-up **stays exactly as it is** and remains the default. Customer booking deposits are **not** part of this.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers or server actions.

## Security rules (must follow)
- Secrets only in server env vars, never `NEXT_PUBLIC_*`, never logged, never in client code or git. Replace the BayadGate placeholders in `.env.example` with:
  `QUICKPAY_ENABLED=` (`1` to turn on), `QUICKPAY_BASE_URL=https://quickpayph.com/api/v1`, `QUICKPAY_API_KEY=` (a `qp_test_...` key for now), `QUICKPAY_WEBHOOK_SECRET=` (the endpoint signing secret), `QUICKPAY_TOPUP_MAX=5000`.
- The API key must have only the **read** and **checkouts** scopes. **Never** use the `withdraw` scope and never call the withdrawals API from the app. Withdrawals are done by hand in the QuickPay dashboard.
- Credits are added **only** by the server after the webhook passes every check below. The browser visit to `success_url` never adds credits (QuickPay says so too).
- If `QUICKPAY_API_KEY` starts with `qp_test_`, treat everything as test: accept only events with `livemode: false`. If it starts with `qp_live_`, accept only `livemode: true`. Refuse to start (feature disabled, logged once) if the key prefix is neither.
- Do not change payment, booking, commission or the existing top-up approval logic.

## 0. Look at the code first and report
Open the BayadGate code Codex already wrote (`lib/payments/bayadgate.ts`, the create and callback routes, the owner credits UI and the admin online top-ups list), the migrations `202611260001_gateway_topups.sql` and `202611270001_gateway_topups_quickpay.sql`, `components/owner/credits.tsx`, `app/admin/topups/page.tsx`, the audit helpers, and how other server routes read `SUPABASE_SECRET_KEY`. Report what you will reuse and what you will remove.

## 1. Database
Apply `202611270001_gateway_topups_quickpay.sql` (after `202611260001_...`). It drops the method check, adds `provider_checkout_id` and `livemode`, adds `gateway_webhook_events` (de-duplication by event id) with the server-only function `record_gateway_event`, and `expire_gateway_topup`. `post_gateway_topup(order_id, amount_in_pesos)` is reused unchanged. `method` now stores the QuickPay channel in lower case (`gcash`, `maya`, `gotyme`, `grabpay`, `shopeepay`, `banks`, `qrph`) or null. Do not add other tables.

## 2. Server code
- `lib/payments/quickpay.ts` (`import "server-only"`), all requests with `Authorization: Bearer <QUICKPAY_API_KEY>`, 10-second timeout, no secret in logs or errors:
  - `createCheckout({ orderId, amountPesos, channel?, successUrl, cancelUrl, description })`: `POST {BASE}/checkouts`, headers `Content-Type: application/json` and **`Idempotency-Key: <orderId>`** (required). Body: `amount` = pesos × 100 as an **integer** (whole pesos only; QuickPay refuses centavos), `reference = orderId`, `description` ("Kuyog Bohol credit top-up"), `success_url` = `{NEXT_PUBLIC_SITE_URL or request origin}/owner/credits?topup={orderId}`, `cancel_url` = `/owner/credits`, `expires_in_minutes: 60`, `metadata: { order_id: orderId }`, optional `channel` (only the channels the UI offers). Expect `201` (or `200` on an idempotent replay). Return `{ id, url, livemode }`. Always send the owner to the `url` QuickPay returns.
  - `getCheckout(id)`: `GET {BASE}/checkouts/{id}`; returns `status`, `amount`, `reference`, `livemode`, `metadata`.
  - Map errors to friendly owner messages and log the code server-side: `amount_too_small`/`amount_too_large`/`invalid_input` ("Choose a whole-peso amount between ₱100 and ₱5,000"), `channel_not_offered` ("That payment method is not available. Try another."), `account_not_active`, `daily_received_limit`, `too_many_attempts`, `rate_limited`, `gateway_unavailable` and network errors ("Online payment is temporarily unavailable. Please try again or use the QR top-up below.").
  - `verifyWebhook(rawBody, signatureHeader)`: parse `QuickPay-Signature` (`t=<unix>,v1=<hex>`), reject if `t` is more than 300 seconds from the server clock, compute `HMAC-SHA256(QUICKPAY_WEBHOOK_SECRET, t + "." + rawBody)` as lowercase hex, compare with `crypto.timingSafeEqual` (equal length check first).
- `POST /api/payments/topup/create` (rename from the BayadGate path if needed; owner session required, owner active, flag on): validate `amount` (whole pesos, min = the owner's existing minimum top-up and at least 100, max `QUICKPAY_TOPUP_MAX`) and optional `channel` from an allow-list. Create the `gateway_topups` row (`order_id = 'KBT-' + 12 random chars`, `provider = 'quickpay'`, `livemode` from the key prefix) with the service role, call `createCheckout`, save `provider_checkout_id` and `payment_url`, return the URL. If QuickPay fails, set the row `failed` and return the friendly message with HTTP 502/503. Rate limit (5 per 10 minutes per owner). The route must never return the raw upstream error.
- `POST /api/payments/quickpay/webhook` (public, no session, `export const runtime = "nodejs"`, read the **raw body** with `await request.text()` before parsing):
  1. Flag off → 404.
  2. Verify the signature; invalid → 400 and nothing else happens.
  3. Parse JSON; require `id` (event id), `type`, `livemode`, `data`. `livemode` must match the key prefix mode; otherwise return 200 and ignore (log "wrong mode").
  4. `record_gateway_event('quickpay', id, type, order_id)`; if it returns false (already seen) return 200 immediately.
  5. `checkout.paid`: `order_id = data.metadata.order_id` (fall back to `data.reference`). Load the `gateway_topups` row; unknown order → 200 and log. Confirm with `getCheckout(data.id)`: `status === "paid"`, `reference`/metadata matches, `amount` (centavos) equals the stored amount × 100, and `data.id` equals the stored `provider_checkout_id`. If all match, `post_gateway_topup(order_id, amountPesos)`. If the confirmation call fails with a network/5xx error, return **500** so QuickPay retries; if it clearly disagrees, `flag_gateway_topup(order_id)` (status `needs_review`) and return 200.
  6. `checkout.expired`: `expire_gateway_topup(order_id)`.
  7. `checkout.extra_payment`: flag the order `needs_review` and notify admins with the existing admin notification helper (someone paid again on an already closed checkout, which needs a manual look in the QuickPay dashboard).
  8. Ignore all other event types (withdrawal.*, payout_account.changed) with 200.
  9. Return 200 within 10 seconds; do slow work (notifications) after the money is recorded. Do not redirect. Deduplication is by event id and also by the `post_gateway_topup` idempotency (order already paid returns `already_paid`).
- Expiry: lazily call `expire_gateway_topups()` when an owner opens the credits page (or reuse the cron pattern in the repo).

## 3. Owner UI (mobile first; keep desktop layout otherwise unchanged)
Reuse the existing "Pay online" card on `components/owner/credits.tsx`: amount chips (₱500, ₱1,000, ₱2,000, custom whole pesos), method buttons (GCash, Maya, GoTyme, and "Other (QR Ph or bank)" which omits `channel` so QuickPay shows its own choices), primary **Continue to payment** (redirect to the returned `url`), note "Credits are added after the payment is confirmed. Usually a few minutes." Keep the secondary link "Pay by QR and upload proof instead" to the existing manual form. Return view `/owner/credits?topup={orderId}`: status card (Waiting for confirmation with a 5-second refresh for up to 2 minutes, Credits added, Not completed) from the owner's own `gateway_topups` row only. Friendly errors, spinners, disabled while working. Only show the card when `QUICKPAY_ENABLED=1`.

## 4. Admin UI
Keep the read-only "Online top-ups" list: order id, owner, amount, channel, status (Created, Paid, Needs review, Expired, Failed), time, and a small chip "Test" when `livemode` is false. "Needs review" rows tell the admin to check the QuickPay dashboard and, only if money really arrived, use the existing **Adjust credits**.

## 5. Tests (QuickPay test key `qp_test_...`, Vercel Preview)
Setup note for Jabez (not code): in the QuickPay dashboard, Developers, Webhooks, **Add endpoint** with `https://<preview-domain>/api/payments/quickpay/webhook`, tick `checkout.paid`, `checkout.expired`, `checkout.extra_payment`, copy the signing secret once into `QUICKPAY_WEBHOOK_SECRET`. Vercel Deployment Protection must be off for the preview, or QuickPay gets a login page.
1. Flag off: no card, webhook returns 404, create route 404.
2. Create a ₱500 top-up: owner is redirected to the QuickPay `url`; the row is `created` with `provider_checkout_id`.
3. `POST https://quickpayph.com/api/v1/checkouts/{id}/simulate` with `{"result":"paid"}` and the test key: webhook arrives, signature verifies, credits increase by exactly ₱500 once, owner is notified, status `paid`.
4. Use the dashboard **Replay** on that delivery 3 times: no extra credits, response 200.
5. Bad signature, signature from a different secret, timestamp older than 5 minutes, modified body: 400, nothing changes.
6. `livemode: true` event on a test key: ignored.
7. Event with a mismatching amount or unknown order: nothing credited; mismatch becomes `needs_review`.
8. Simulate `failed`: nothing credited. Let a checkout expire: row `expired`; a late paid event for an expired row is flagged `needs_review`, not credited.
9. Owner A cannot read or create rows for owner B; `authenticated` clients cannot write `gateway_topups` or call the functions.
10. Amount rules: centavos, below ₱100 and above `QUICKPAY_TOPUP_MAX` are rejected with friendly text.
11. No secret appears in client bundles, logs or errors (search the build output for the env names and values). Manual QR top-up works untouched.
12. `npm run lint`, `npx tsc --noEmit`, `npm run build`. List anything you could not verify.

## Out of scope
Customer deposits, withdrawals/payouts through the API, payment links, production rollout with live keys, refunds of online top-ups.

## Codex prompt
*"Read `kuyog-bohol-quickpay-topup-sandbox.md` and the QuickPay docs at https://quickpayph.com/docs/. First report the existing BayadGate code and what you will reuse. Then replace BayadGate with QuickPay for the online owner top-up: apply the new migration, write `lib/payments/quickpay.ts` (checkout create with an Idempotency-Key and centavo amounts, checkout fetch, HMAC-SHA256 webhook verification on the raw body with a 5-minute window), the create route, the webhook route with event de-duplication and confirmation by fetching the checkout, and update the owner and admin UI. Credits only from the verified webhook, never from the redirect; test keys accept only livemode false; no withdraw scope or withdrawal calls; secrets stay server-side; keep the manual QR top-up unchanged. Run lint, typecheck and build, run the tests in section 5, and list anything you could not verify."*
