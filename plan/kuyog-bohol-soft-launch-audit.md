# Kuyog Bohol — Soft Launch Audit (5 users)

Repo reviewed: `OggyYggo/jc-rentals`, latest commit `4c11a1d` (Nov 24, 23:00). Date of review: Nov 25, 2026.

## What this review is, and is not

- **Is:** a read of the code, the database migrations (all ~60), the API routes, the config files and the plan folder. I verified each finding below in the code.
- **Is not:** a test of the running app. I did **not** log in, use the live Supabase or Vercel dashboards, try real payments, or run a penetration test. Anything that depends on a dashboard setting is listed under "Check in your dashboards" and is **unconfirmed**.
- Not legal or tax advice. For privacy and business registration, ask a lawyer or the National Privacy Commission.

## Overall verdict

The foundation is stronger than most first launches. For 5 trusted users it is **close to ready**, after you fix the "Must fix" list (about one to two days of work) and confirm the dashboard checks.

**What is done well (verified in code)**
- Row-level security is on and specific. I found one `using (true)` policy and it was removed later (reviews). Columns users can update are limited by grants (profiles, owners, payments, bookings).
- Money tables are written only through guarded database functions, and the ledger and invoice rules block owners from crediting themselves (owner inserts are limited to a pending top-up).
- Private storage buckets with per-user folders for documents, proofs, QR images and refund proofs. Documents and selfies are re-encoded and resized on upload, so image-based attacks are unlikely.
- Cron and webhook routes check a secret using a timing-safe compare. Dispatch routes are not guessable-public.
- Security headers are set (HSTS, no framing, no sniffing, strict referrer, restricted permissions), pickup pages are `no-store` and `noindex`.
- Rate limiting and Cloudflare Turnstile on the contact and apply forms; the pickup scan has its own limits in the database.
- Car limit per plan is enforced by a database trigger, so owners cannot bypass it from the browser.
- Audit log, booking overlap protection, expiry jobs and the cancellation, refund and review logic exist.

---

## A) Must fix before the soft launch

### A1. Privacy Policy and Terms are almost empty (High, legal and trust)
`app/privacy/page.tsx` is 23 lines and only describes contact messages and their 12-month retention. `app/terms/page.tsx` is 14 lines. You collect **driver's licenses, IDs, selfies with ID, payment proofs, phone numbers and QR codes**. The policy must say what you collect, why, who can see it (admin, and the owner for a booking), how long you keep it, how to ask for deletion or correction, and who to contact (kuyogbohol@gmail.com or a named contact person). Add a consent line at the point of upload ("I agree to the Privacy Policy and allow Kuyog Bohol and the owner of my booked vehicle to see my documents"), stored with a timestamp. Terms should cover deposits, cancellation, damage and responsibility, platform role (a marketplace, not the rental company), and the 5% commission wording for owners. Have a lawyer or a trusted adult review it. The Philippine Data Privacy Act applies when you handle personal data of people in the Philippines; ask about whether and when you must register with the National Privacy Commission.

### A2. Confirm scheduled jobs are actually running (High, operations)
Booking expiry, plan expiry, review prompts, refund reminders, payment-review reminders and pickup reminders are scheduled in migrations only `if exists (cron schema)` and the migration quietly skips scheduling if the extension is missing. If `pg_cron` is not enabled in Supabase, **unpaid bookings never expire and dates stay blocked**. Check in the Supabase SQL editor: `select jobname, schedule, active from cron.job;` (expect about 7 jobs) and `select * from cron.job_run_details order by start_time desc limit 20;`. Enable the `pg_cron` extension if the list is empty, then re-run the scheduling statements.

### A3. Confirm email and notifications are really delivered (High, operations)
- **Sign-up confirmation email:** you reported earlier that it was not sending. Check Supabase Auth → SMTP uses Resend with your verified domain, the sender is on `kuyogbohol.app`, Auth → URL Configuration has Site URL `https://kuyogbohol.app` and the redirect URLs for `/auth/callback` and `/auth/confirm`. Test with two new accounts (Gmail and another provider) and check spam folders.
- **In-app notification emails and push:** `app/api/notifications/dispatch` and `app/api/admin-alerts/dispatch` are called with `NOTIFY_WEBHOOK_SECRET`. The repo has **no migration that sets up the Database Webhook** (no `pg_net` or webhook SQL), so it must be created in the Supabase dashboard (Database → Webhooks) pointing to the production URL with header `x-webhook-secret`. Confirm it exists, and that a test booking really creates an email and an admin alert.
- Vercel has only one cron (`/api/admin-alerts/digest` daily). That is fine, but confirm `CRON_SECRET` is set in Vercel Production, or the digest returns unauthorized.

### A4. Separate the test data from the real data (High)
Before the 5 users start: delete test accounts, test bookings, test payments and test cars that you do not want public; check that the super admin email is correct (`202611190008_correct_super_admin_email.sql` changed it once, so verify the live value); make sure there is a second admin or a recovery plan if the admin account is locked. Use a **separate Supabase project and Vercel Preview** for experiments, so tests never touch live data.

### A5. Add a way to pause bookings (Medium, safety)
I found no site-wide switch to stop new booking requests (only per-car availability and owner calendar blocks). During a soft launch you want a "pause bookings" switch that an admin can flip from settings (stores a flag in `public.settings`; the booking request function and the car page both check it and show "Bookings are temporarily paused"). Also add an admin way to **fix a stuck booking** (set status with a required reason, written to the audit log) so you never edit the database by hand with real money involved.

### A6. Add error monitoring (Medium, operations)
`package.json` has no Sentry, no Vercel Analytics or Speed Insights, and errors are only `console.error` lines. With real users you will not know about failures unless someone tells you. Add Sentry (free tier) for server and client errors, with no personal data (no names, IDs, document paths) in error reports, and enable Vercel logs retention. Add a small `/api/health` check that tests the database connection, and a free uptime monitor (UptimeRobot or Better Stack) on it.

### A7. Turn the security header from report-only to enforced, and tighten it (Medium)
The Content-Security-Policy is **report-only** (`Content-Security-Policy-Report-Only` in `next.config.ts`), so it blocks nothing, and it allows `'unsafe-inline'` scripts. Watch the browser console on every page for violations, fix them, then switch to enforcing `Content-Security-Policy`. A nonce-based policy is better but can be a later step.

### A8. Add CAPTCHA or stricter limits on sign-up and login (Medium)
Turnstile is used on contact and apply, not on `/signup` or `/login`. Without it, bots can create accounts and trigger confirmation emails (which can hurt your Resend reputation). Turn on CAPTCHA protection in Supabase Auth (it supports Turnstile) and keep Supabase's default rate limits. Confirm that leaked-password protection and a minimum password length of at least 8 are on.

### A9. Backups and recovery (High)
Check your Supabase plan: Point-in-time recovery and daily backups depend on the plan, and the free plan has limited or no backups. Before real money and ID documents are stored, either upgrade or schedule your own backups, and write down how to restore. Also check Vercel's plan terms: the free Hobby plan is meant for non-commercial use, so a business site should be on a paid plan (verify the current terms on Vercel's site).

---

## B) Should fix soon after (first 2 to 4 weeks)

1. **Run the real flow on real phones**, for every role, before inviting users: sign up, verify email, upload documents, request a car, accept the policy, pay by each QR option, owner confirm, pickup pass scan, return, review. Do this on Android and iPhone and in Chrome and Safari. Pay special attention to the camera scanner (`/owner/scan`), file uploads from the phone gallery, and the Open app buttons.
2. **Tests:** only two test files exist (`tests/dashboard-alerts.test.mjs`, `tests/pickup-qr.test.mjs`) and `package.json` has no `test` script. Add a `test` script and a small set of tests for the money logic (deposit math, cancellation fee, refund, commission ledger), booking overlap, expiry, and role access. Add a GitHub Action that runs lint, typecheck, tests and build on every push.
3. **Rate limits on authenticated actions:** the document upload route and the pickup lookup have no visible application-level limit beyond login; add per-user limits (for example 10 uploads per hour) so a compromised account cannot flood storage.
4. **PDF documents:** PDFs are accepted after a magic-byte check only (images are re-encoded). Either accept images only for IDs, or serve PDFs only as downloads with `Content-Disposition: attachment` through short-lived signed URLs.
5. **Promo image endpoints** (`/api/promo/...`) render images and PDFs on demand and call storage. Confirm they require login and add a limit so they cannot be used to burn server time.
6. **Data deletion:** add a way for a customer to request account and document deletion (a form to the admin is enough at first), and write down your retention periods (for example, delete rejected or old ID documents after N months). Record it in the audit log.
7. **Admin safety:** require a reason for every refund, document view and payment decision (partly done in the hardening work); consider two-step confirmation for "Mark refunded" and "Confirm payment". Make sure admin document views are logged.
8. **Content cleanup:** search for placeholder text and wrong domains (`kuyogbohol.com` appeared in `app/apply/actions.ts` earlier; re-check after the SEO changes), and replace every sample number on the pricing and landing pages with real ones.
9. **Mobile pass:** check each owner page on a 360px screen (the latest commit says "UI Correction at Owner Workspace Mobile", so this is already underway), especially tables and the scanner.
10. **Support process:** publish a support contact (Facebook page and email), set an owner and admin response target (for example payments reviewed within 6 hours), and prepare short message templates for the common cases (payment not confirmed, owner not responding, refund).
11. **Dependency check:** run `npm audit` and update packages before launch, and enable GitHub Dependabot alerts. Pin Node and Next versions.
12. **Google and social:** add the SEO work from `kuyog-bohol-seo-google-visibility.md` after the soft launch, not before.

## C) Nice to have later

- Move rate limits to a shared store (Upstash or Supabase table) if traffic grows.
- A nonce-based CSP without `unsafe-inline`.
- Automated end-to-end tests (Playwright) for the booking journey.
- Admin dashboard for stuck states (payments in review for too long, refunds owed, unreviewed documents).
- Multi-factor authentication for admin and owner accounts (Supabase supports it).
- A status page and a public changelog.
- A payment gateway for the platform's own income (commission and credits), as discussed earlier.

---

## Check in your dashboards (I could not see these)

**Supabase**
- [ ] Production project is separate from test; the correct URL and keys are in Vercel Production.
- [ ] `pg_cron` is enabled and `cron.job` lists the 7 jobs (A2).
- [ ] Database Webhook to `/api/notifications/dispatch` and `/api/admin-alerts/dispatch` exists with the secret header (A3).
- [ ] Auth: SMTP via Resend, Site URL and Redirect URLs for `kuyogbohol.app`, email confirmation on, CAPTCHA on, password rules (A3, A8).
- [ ] All migrations through `202611240001` are applied in production, in order, with no errors.
- [ ] Storage buckets are all **private** except car photos: `customer-docs`, `payment-proofs`, owner QR, plan proofs, refund proofs, selfies, owner application files.
- [ ] Backups and retention match your plan (A9).
- [ ] The service-role (secret) key exists only in Vercel server environment variables and never in the browser or in git.

**Vercel**
- [ ] Production variables set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL=https://kuyogbohol.app`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL`, `NOTIFY_WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_INBOX_EMAIL`, `APPLY_COOKIE_SECRET`. Preview uses different (test) values.
- [ ] `RESEND_TEMPLATE_ID` set if the code path needs it.
- [ ] Domain `kuyogbohol.app` is attached, HTTPS works, `www` redirects.
- [ ] The Vercel cron for the digest shows as active.

**Resend**
- [ ] Domain verified (SPF, DKIM), sending address on `kuyogbohol.app`, and DMARC set.

---

## 5-user soft launch plan

**Who:** 2 customers you know, 1 to 2 friendly owners, plus yourself as admin. Tell them it is a test.

**Rules for the first 2 weeks**
1. Start with 1 or 2 cars and **only** your most trusted owner partner(s). Keep deposit percentage at the default.
2. Be online during pickup and payment times. Check the admin screen every few hours for payments in review.
3. Keep a simple log (a sheet is fine): date, what happened, what broke, what confused people.
4. Do one **dry run** with yourself and a friend, with real small amounts (₱20 to ₱50), through the whole journey including a cancel and a refund.
5. Ask every user three questions at the end: what was confusing, what felt unsafe, what would stop you from recommending it.

**Go / no-go before inviting anyone**
- [ ] Section A items 1 to 9 done (or consciously accepted).
- [ ] Dry run completed on Android and iPhone.
- [ ] Sign-up email arrives in under 1 minute.
- [ ] An unpaid booking expires by itself on schedule.
- [ ] Owner receives a notification for a new payment proof.
- [ ] Privacy Policy and Terms published and linked in the footer and at sign-up.
- [ ] Pause switch works.
- [ ] Error monitoring receives a test error.
- [ ] You know how to restore from backup.

**Stop and pause bookings if:** a payment is credited twice, a customer can see another person's data, emails stop sending, or expired bookings keep blocking dates.

---

## Codex prompt (for the code parts of section A and B)

*"Read `kuyog-bohol-soft-launch-audit.md`. Implement only the code changes in sections A1 (Privacy Policy and Terms pages with the structure described, plus a consent checkbox with timestamp at document upload; leave final legal wording marked for review), A5 (admin settings switch to pause new bookings, checked by the booking request function and the car page, plus an admin RPC to set a stuck booking's status with a required reason written to the audit log), A6 (Sentry with no personal data, and `/api/health`), A7 (collect CSP violations in report-only mode and then switch to enforced `Content-Security-Policy`, listing what you changed), A8 (Turnstile on sign-up and login if Supabase CAPTCHA support is wired in the auth form), B2 (a `test` script, money-logic tests and a GitHub Action running lint, typecheck, tests and build), B3 (per-user rate limits on uploads), and B4 (PDFs as attachment downloads only). Do not change the database tables or policies except for the new settings keys and RPCs. Do not touch anything that depends on dashboard settings; list those as manual steps. Run lint, typecheck, tests and build, and list anything you could not verify."*
