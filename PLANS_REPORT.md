# Plans implementation report

## Implemented

- Added the owner plan schema, seeded Starter, Standard, Fleet, and Custom plans, and backfilled existing owners without changing their active cars or commission rates.
- Added RLS and grants for plan data, owner plan records, plan payment records, and audit events.
- Added effective plan and car usage RPCs, database level active car enforcement, commission synchronization, plan activation, owner Starter downgrade, admin overrides/extensions, payment submission/review RPCs, and scheduled expiry handling.
- Added the public `/pricing` page, with database driven plan cards, computed break even figures and booking example, comparison, FAQ, metadata, sitemap entry, and public pricing links.
- Added the owner `/owner/plan` overview and car usage display, plan hidden badges, and friendly car limit error mapping on `/owner/cars`.
- Added the application plan preference flow: query parameter preselection, keyboard accessible plan picker, server-side validation, receipt and confirmation email copy, admin application filter/chip, approval invite metadata, and post-approval activation link.
- Added owner plan payment submission UI on `/owner/plan?choose=...` and an admin plan payment review queue. Payment proofs use a private bucket with owner/admin storage policies.

## Verification

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run build` passes after marking `/pricing` as `instant = false` for its uncached Supabase request.
- ESLint passes for the changed TypeScript files with two image optimization warnings on signed proof images.
- Repository-wide `npm.cmd run lint` still reports 16 existing errors in unrelated admin, promotions, car details, search, and notification files.

## Not verified or still needed

- The SQL migration has not been applied to a Supabase instance. The plan SQL scenarios, RLS behavior, trigger concurrency, cron execution, and notification delivery remain unverified against PostgreSQL.
- The full admin plans editor, expiry reminder delivery, and plan filters on the admin owner directory remain unfinished.
- Supabase migrations `202611190001_owner_plans.sql` and `202611190002_application_preferred_plan.sql` still need to be applied before the pages can read plan preferences, store payment proofs, or process payment RPCs.
- Responsive browser review was not run.
- The pricing page currently renders dynamically; the proposed five minute data cache was not added because route level `revalidate` conflicts with this app's enabled Cache Components configuration.
