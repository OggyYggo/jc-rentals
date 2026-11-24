# Kuyog Bohol — Multiple Payment Options per Owner (Instructions for Codex)

Lets an owner add several payment accounts (GCash, Maya, GoTyme, BPI, MariBank, other QR Ph). The customer picks the app they use, sees that account's QR, and gets an **Open app** button where a reliable link exists. Designs: canvas boards **"Pay: choose bank"**, **"Pay: scan and open app"**, **"Owner: payment options"** (mobile).

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes or server actions.

## Principles

- **Money still goes directly from the customer to the owner.** No gateway, no platform wallet. The owner confirms payment as today.
- A QR image cannot start a payment inside another app. The reliable flow is: choose option → show that QR, the exact amount and the booking reference → customer pays in their app → sends proof. **Open app** is a convenience only.
- Mobile-first UI. Do not change the desktop layout of existing pages beyond what is needed.
- Reuse the existing pay page, proof form, QR upload and admin verification. Do not break existing bookings or owners.
- If `kuyog-bohol-qr-payment-hardening.md`, `kuyog-bohol-hardening-followup-fix.md` and `kuyog-bohol-booking-flow-mobile-ui.md` are already applied, build on them. If they are not, still follow this file and keep your changes compatible.

## 0. Look at the code first and report

Today each owner has **one** payment QR stored on `public.owners`: `payment_method_label`, `payment_account_name`, `payment_qr_path`, `payment_qr_verified` (migration `202611060003_payment_qr_module.sql`). A trigger `reset_owner_payment_qr_verification` clears verification when those fields change, owners can update the three payment fields, and `admin_set_owner_payment_qr_verified` lets an admin verify. `owner_can_accept` checks owner readiness.

Open and report: `app/owner/payment-settings/page.tsx`, `components/owner/payment-settings-form.tsx`, `app/account/bookings/[id]/pay/page.tsx`, `components/customer/payment-proof-form.tsx`, `components/admin/owner-payment-terms.tsx`, `components/admin/owner-manager.tsx`, `app/admin/owners/[id]/page.tsx`, how the QR image is stored and how the pay page gets a link to it (private bucket, signed URL or public), and every place that reads `payment_qr_path` or `payment_qr_verified` (including `app/apply/actions.ts`, `app/admin/owner-applications/actions.ts` and the later guest-owner migrations).

## 1. Database (new migration, safe to run twice)

Name it like `202611240001_owner_payment_options.sql`. Do **not** drop the old `owners.payment_*` columns in this change; they stay for compatibility and are filled from the preferred option.

### 1.1 Table

```sql
create table if not exists public.owner_payment_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  provider text not null check (provider in ('gcash','maya','gotyme','bpi','maribank','other_qrph')),
  label text not null,                    -- shown to customers, e.g. "GCash"
  account_name text not null,
  account_hint text,                      -- masked, e.g. "••• 4567"; never a full account number
  qr_path text not null,
  is_preferred boolean not null default false,
  sort_order int not null default 0,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  rejection_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists owner_payment_options_owner_idx on public.owner_payment_options (owner_id, sort_order);
create unique index if not exists owner_payment_options_one_preferred
  on public.owner_payment_options (owner_id) where is_preferred and is_active;
create unique index if not exists owner_payment_options_one_per_provider
  on public.owner_payment_options (owner_id, provider) where provider <> 'other_qrph' and is_active;
```
- Limit to **8 active options per owner** (trigger or check in the RPC).
- `account_hint` is optional and masked. Never store a full card or bank account number. Mask any value an owner types that looks like a long number (keep the last 4 digits).

### 1.2 Backfill

For every owner with a non-null `payment_qr_path`, insert one option: provider guessed from `payment_method_label` (case-insensitive contains `gcash`, `maya`, `gotyme`, `bpi`, `maribank`; otherwise `other_qrph`), `label` from `payment_method_label`, `account_name`, `qr_path`, `verified` from `payment_qr_verified`, `is_preferred = true`. Skip owners who already have an option. Report counts.

### 1.3 Keep the old owner columns in sync

A trigger on `owner_payment_options` copies the **preferred, active** option's label, account name, QR path and verified flag into `owners.payment_*`, or nulls them if none exists. This keeps any code that still reads the old columns working. Mark the old columns as deprecated in a comment.

### 1.4 Verification rules

- Editing `provider`, `label`, `account_name`, `account_hint` or `qr_path` of an option sets `verified = false` (like the existing owner trigger). Changing `is_preferred`, `sort_order` or `is_active` does not.
- Only admins can set `verified`, `verified_at`, `verified_by`, `rejection_reason`. Enforce in a trigger like the existing one and expose RPCs:
  - `admin_set_payment_option_verified(p_option_id uuid, p_verified boolean, p_reason text default null)` (security definer, `set search_path = ''`, admin only; verifying requires a non-empty QR path; rejecting requires a reason).
- Owner RPCs (security definer, `set search_path = ''`, checks that the caller owns the option):
  - `owner_save_payment_option(p_option_id uuid, p_provider text, p_label text, p_account_name text, p_account_hint text, p_qr_path text)`: create or update; the QR path must start with the owner's own storage folder (match the current upload convention).
  - `owner_set_preferred_payment_option(p_option_id uuid)`
  - `owner_reorder_payment_options(p_ids uuid[])`
  - `owner_remove_payment_option(p_option_id uuid)` (soft remove with `is_active = false`; refuse if it is the only verified option and the owner has bookings awaiting payment, with a friendly message).
- Grant execute to `authenticated` only. Revoke from `anon` and `public`.

### 1.5 RLS

- Owners can read and manage (through the RPCs) their own options.
- Admins can read all.
- **Customers** can read only **verified, active** options of an owner for a booking they own that is `awaiting_payment` or `payment_review`, and for the public car page only the **provider labels** (not account names or QR paths). The simplest safe way is a security-definer RPC `get_booking_payment_options(p_booking_id uuid)` that checks `bookings.customer_id = auth.uid()` and returns provider, label, account_name, account_hint, sort_order, is_preferred and a signed-URL-ready `qr_path`. Do not expose `qr_path` through a public table or view.
- Public listing helper `get_owner_accepted_providers(p_owner_id uuid)` (or a column in the existing public car query) that returns provider labels only, for the "Accepted payments" chips on car pages.

### 1.6 Owner readiness

Update `owner_can_accept` (and anything that equals "QR verified") so an owner is ready when they have **at least one verified, active option**. Keep the existing behavior for owners that only have the old fields (they were backfilled, so this should be the same).

### 1.7 Record which option was used

```sql
alter table public.payments
  add column if not exists payment_option_id uuid references public.owner_payment_options(id) on delete set null,
  add column if not exists payment_provider text,
  add column if not exists payment_label text;
```
Set them from the customer's selection when the proof is sent. Store provider and label as a **snapshot** so history stays correct if the owner edits or removes the option. The validate trigger must check that the chosen option belongs to the booking's owner and is verified and active at that moment; if the customer sends no option (old client), accept it and leave the columns empty. Do not change the proof validation that already exists (amount, reference, proof path, one-pending rules).

## 2. Customer pay page (mobile)

File: `app/account/bookings/[id]/pay/page.tsx`, `components/customer/payment-proof-form.tsx`.

**Choose bank** ("Pay: choose bank" board):
1. Blue **Amount to pay** card (amount, time left, **Copy amount**) stays at the top.
2. Label "Pay with", then a radio list of the owner's verified options in `sort_order`, preferred first. Each row: provider logo tile, label, account name with masked hint, radio indicator. Min touch height 56px.
3. If the owner has exactly **one** option, skip the chooser and show the scan view directly.
4. **Continue** is disabled until an option is chosen. Remember the choice in `sessionStorage` (wrapped in try/catch) for this booking only.

**Scan and pay** ("Pay: scan and open app" board):
1. A horizontal selector of the owner's options at the top lets the customer switch without going back.
2. Card with the option's logo, account name and masked hint, its QR (about 176px, tap to enlarge), then buttons **Open {app} app** (only when a link is configured, section 3) and **Download QR**.
3. "How to pay" card: open the app and tap Pay QR; scan or upload the QR and enter exactly the amount; add the booking reference as a note. Include **Copy** for the booking reference. Change the app name in the steps to the selected option (keep generic wording for `other_qrph`).
4. **I paid, send proof** goes to the existing proof form (reference number and screenshot). Send the chosen `payment_option_id` with the proof.
5. Short note: "Your proof records which option you used."
6. Keep the existing states: loading spinner on buttons, countdown, review, confirmed, friendly errors. Never show raw database or storage text.
7. QR images use short-lived signed URLs (same mechanism as today). No QR in public storage.

**Car page:** add small "Accepted payments" chips (GCash, Maya, GoTyme, BPI, MariBank) from `get_owner_accepted_providers`. Hide the row when none. This is information only.

## 3. "Open app" button

- Create `lib/payments/providers.ts` with one entry per provider: `label`, brand color, short logo letter (a logo image only if Jabez supplies licensed assets; do not copy trademarked logos from the web), and an optional `appLink`.
- **Do not guess app links.** Only fill an `appLink` when you can confirm it from the provider's official documentation or a tested device. If you cannot confirm one, leave it empty and the button is **not shown** for that provider. Report which providers have a link and how you verified it.
- Behavior when a link exists: a normal anchor or `window.location` call from a user tap; no popups; if the app does not open within about 1.5 seconds (check `visibilitychange` or a timer), keep the page as it is and show "Could not open the app. Save the QR and scan it from your gallery." No error, no redirect loops.
- Never put the amount, booking reference or customer data in a link unless the provider's documentation supports it and it is safe.
- The flow must work fully without the button. The QR, amount, reference and proof upload are the real path.

## 4. Owner settings (mobile)

File: `app/owner/payment-settings/page.tsx`, `components/owner/payment-settings-form.tsx` ("Owner: payment options" board).
1. List of the owner's options: logo tile, label, name with masked hint, **Preferred** chip, status chip (`Verified`, `Under review`, `Rejected: {reason}`), and actions **Replace QR**, **Edit**, **Remove**.
2. **+ Add payment option** opens a form: provider (select), label (prefilled from provider, editable for `other_qrph`), account name, optional last 4 digits, QR image upload (same file rules and storage folder as today), and a **Make preferred** toggle.
3. Info line: "Add every account you can receive money in. Each QR is checked by the Kuyog Bohol admin before customers see it." Footer note: "Only verified options are shown to customers. Changing a QR sends it back to review."
4. Show a clear message if the owner has no verified option: customers cannot pay yet, and the owner cannot accept bookings (use the existing messaging for owner readiness).
5. Loading spinners on all buttons; friendly errors; `router.refresh()` after saves.

## 5. Admin

Files: `components/admin/owner-payment-terms.tsx`, `components/admin/owner-manager.tsx`, `app/admin/owners/[id]/page.tsx`.
1. In the owner detail view, list every option with a signed-URL QR preview, account name, status and **Verify** and **Reject with reason** actions (calls `admin_set_payment_option_verified`). Opening the QR uses a signed URL (view, not download).
2. The owner list's "QR verified" indicator becomes "{n} verified options" (or "Verified" if at least one).
3. New-application and guest-owner flows that set the old payment fields must create an `owner_payment_options` row instead (or in addition, with the trigger keeping both in sync). Check `app/apply/actions.ts` and `app/admin/owner-applications/actions.ts`.
4. Owner-side and admin-side notices of a rejected QR use the existing notification pattern if one exists. Do not add a new notification system here.

## 6. Owner confirmation screen

In the owner's payment review view, show **which option the customer used** (provider and label from the snapshot) next to the amount and reference, so the owner knows which account to check. If the payment row has none (older rows), show nothing extra.

## 7. Security and privacy

- Never store full bank or e-wallet account numbers. Masked hints only.
- QR images stay in the private bucket; customers see them only for their own awaiting-payment bookings.
- RPC and function rules: `set search_path = ''`, explicit grants, no `public` or `anon` access.
- A customer cannot pick another owner's option; the check is in the database, not only the UI.
- Rate limiting is not needed here beyond existing proof rules.

## 8. Tests

1. Owner with three options: customer sees all three on the pay page in the owner's order, preferred first; the unverified or removed ones are hidden.
2. Owner with one option: the chooser is skipped and the QR shows.
3. Customer picks Maya, sends proof: the payment row stores `payment_option_id`, `payment_provider = 'maya'`, `payment_label`; the owner's review screen shows "Maya".
4. Owner edits the Maya QR: it becomes unverified, disappears from the customer list; if it was the only verified option the owner becomes not ready to accept new bookings.
5. Owner removes an option after a customer already paid with it: the old payment still shows the snapshot label.
6. A customer cannot read another booking's options or another owner's QR (RPC returns an error or nothing).
7. A direct insert of a proof with a different owner's `payment_option_id` fails with a friendly message.
8. Old owners (single QR) were backfilled and still work; `owners.payment_*` stays in sync with the preferred option.
9. **Open app** appears only for providers with a verified link, never breaks the page if the app is missing, and the page still shows the QR.
10. Existing booking, proof, review and confirm flows (including the hardening rules) still work.
11. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 9. Open decisions for Jabez

1. **Open app links:** test each app on a real Android and iPhone; keep the button only where it works.
2. **Logos:** use brand logos only if you have permission; otherwise colored letter tiles as in the design.
3. **Maximum options per owner:** default 8.
4. **Should the customer's choice be required to match the owner's confirmation?** Default: no, it is a hint only.

## 10. Out of scope

Payment gateways, automatic payment confirmation, fully prefilled amounts inside other apps, splitting payments across owners, any change to deposit percentages, commissions or credits.

## 11. Codex prompt

*"Read `kuyog-bohol-multi-payment-options.md`. First report how the single owner QR is stored, read and verified today and every place that uses `payment_qr_path` and `payment_qr_verified`. Then add the `owner_payment_options` table with backfill, the sync trigger to the old owner columns, verification rules, owner and admin RPCs, the customer-safe `get_booking_payment_options` RPC, and the payment snapshot columns, all in one safe-to-rerun migration. Build the mobile choose-bank and scan-and-pay screens, the owner payment-options settings, the admin verification view, and show the chosen option on the owner's payment review. Do not guess app links: add an Open app button only for providers whose link you can confirm, and report which ones. Keep money flowing directly to the owner, keep the QR private, and do not drop the old columns. Run lint, typecheck and build, run the tests in section 8, and list anything you could not verify."*
