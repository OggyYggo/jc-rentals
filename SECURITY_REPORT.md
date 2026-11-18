# Security Audit Implementation Report

Implemented from `plan/kuyog-bohol-security-audit-verified.md`.

| Finding | Status | Implementation / remaining action |
|---|---|---|
| A1 — notification RPC grants | Fixed in migration; live verification pending | Apply the migration, then run the audit's `routine_privileges` query in Supabase to verify the live grants. |
| A2 — response headers and CSP | Fixed in report-only mode | Standard security headers are added; observe CSP reports before considering enforcement. |
| A3 — shadcn CLI dependency | Fixed | Moved to development dependencies; production dependency audit added to GitHub Actions. |
| A4 — owner table grants | Fixed in migration; apply pending | Owner payment settings remain column-limited; admin mutations use guarded RPCs. |
| A5 — webhook secret comparison | Fixed | Uses `timingSafeEqual` after checking equal buffer lengths. |
| A6 — environment documentation | Fixed | Added `NOTIFY_WEBHOOK_SECRET` and `RESEND_TEMPLATE_ID` to `.env.example`. |
| A7 — anonymous RPC execution | Fixed in migration; apply pending | Existing authenticated grants are preserved; public and anonymous execution is revoked. |
| A8 — upload and document handling | Fixed | Car IDs are validated as UUIDs; admin document links use 60-second signed download URLs. |
| A9 — promo click flooding | Fixed | Repeated same-car/source clicks from the same attribution cookie are deduplicated for 30 minutes. |
| A10 — public repository review | Reviewed; visibility decision pending | Public plans and project notes describe operational and security architecture. No visibility setting was changed because that is a repository owner decision. |

## Manual follow-up

- Apply both SQL migrations to Supabase, then verify function grants and exercise signup, booking, payment, and notification flows.
- Run `select grantee, privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('notify','notify_admins');` in the Supabase SQL editor after migration.
- Review CSP reports in production for at least a week before changing the policy from report-only to enforcing.
- Confirm document links download correctly in the admin workflow.
- Review the audit's Supabase, Vercel, Resend, Turnstile, and backup settings directly in their dashboards.

## Verification performed

- `npm audit --omit=dev --audit-level=high`: passed; zero production vulnerabilities reported.
- ESLint on the changed TypeScript files: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Turbopack still reports the existing dynamic filesystem tracing warning in `lib/promo/image-assets.ts`.
- Full `npm run lint`: does not pass because of existing lint errors in untouched application files (17 errors and 28 warnings); changed TypeScript files pass targeted lint.
- The live Supabase database was not available in this workspace, so migrations have not been applied and the grants have not been verified against production.
