# Kuyog Bohol security verification

Reviewed local branch `main` at `6962f1e` plus the security-fix changes in its working tree. At review time the four new migrations were untracked and the matching app changes were uncommitted. A preview built from the committed SHA alone will omit these fixes. Verify which revision and migrations the preview uses before testing.

## A. Read-only checks for the live Supabase SQL editor

Run each block separately. Every block is SELECT-only. The SQL editor can see metadata across roles. Its access is different from a customer’s access. Avoid sharing screenshots of internal policy details or customer identifiers.

### A1. Storage policies

This intentionally lists **every** policy on `storage.objects`. Policies can apply indirectly through a helper or omit a bucket condition entirely, so searching policy names for the bucket could miss one. Inspect both expressions and the roles. `ALL` also covers reads and changes. For an UPDATE, `using` checks the existing file and `with_check` checks the proposed one. If the latter is omitted, PostgreSQL can reuse `using`.

**Safe:** Browser sessions have no write policy covering `customer-docs` or `customer-selfies`. Private reads require the file to belong to the caller, or require an authorized relationship to the exact booking, owner, or record. Admin access should be explicit. Vehicle-photo writes may remain available to the vehicle’s owner. Public listing photos are intentionally public.

**Unsafe:** Customer or owner UPDATE or DELETE access to reviewed identity documents, broad access to another user’s private files, or authorization based only on a bucket name or a caller-supplied identifier. The review labels flag candidates. Read the underlying expression and any helper before treating a flag as a finding.

```sql
select policyname, roles, cmd, permissive, qual as using_expression,
       with_check as check_expression,
       case
         when cmd in ('ALL', 'UPDATE', 'DELETE')
           then 'Review whether browser roles can change reviewed objects'
         when cmd = 'SELECT'
           then 'Review who can read private objects'
         else 'Review whether upload scope matches the bucket and user'
       end as review
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;
```

### A2. Bucket visibility

**Safe:** Only `car-photos` is public in this list. `owner-qr` and `platform-qr` are included as related payment assets. Expected buckets appear. Public flags and RLS policies answer different questions.

**Unsafe:** Any private bucket reports `public`, or a missing bucket assumed to be present during testing.

```sql
with expected(bucket, expected_public) as (
  values ('customer-docs',false), ('customer-selfies',false),
         ('payment-proofs',false), ('topup-proofs',false),
         ('refund-proofs',false), ('owner-plan-proofs',false),
         ('owner-qr',false), ('platform-qr',false), ('car-photos',true)
)
select e.bucket, e.expected_public, b.public as actual_public,
       case when b.id is null then 'MISSING'
            when b.public is distinct from e.expected_public then 'UNSAFE'
            else 'EXPECTED' end as result
from expected e left join storage.buckets b on b.id = e.bucket
order by e.bucket;
```

### A3. Public tables with RLS disabled

**Safe:** No client-accessible sensitive table appears. An intentionally internal table needs separate verification that browser roles have no effective grants.

**Unsafe:** A browser role has access to a sensitive table listed here.

```sql
select c.relname as table_name,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_has_access,
       has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_has_access
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
order by c.relname;
```

### A4. Browser table and column grants

The first query lists direct grants visible to the SQL editor. The other two check effective privileges, including inherited grants and grants to `PUBLIC`. `storage.objects` is shared across buckets. Evaluate its grants together with A1.

**Safe:** Browser roles lack direct writes to `push_subscriptions`, `owner_credit_ledger`, `gateway_topups`, `gateway_webhook_events`, and `customer_selfies`. Neither role can edit identity pointers, verification, or role columns. The authenticated profile form may still edit permitted contact fields. Booking creation uses the guarded server flow. Even if a legacy booking INSERT grant exists, A5 must show that browser inserts are blocked.

**Unsafe:** Effective browser write access to the protected tables or columns above, or a booking write grant combined with a policy that permits bypassing the guarded flow.

```sql
select table_schema, table_name, grantee, privilege_type, is_grantable,
       case when table_name in ('push_subscriptions','owner_credit_ledger',
                 'gateway_topups','gateway_webhook_events','profiles','bookings',
                 'customer_selfies','objects')
                 and privilege_type in ('INSERT','UPDATE','DELETE')
            then 'REVIEW WRITE' end as review
from information_schema.role_table_grants
where grantee in ('anon','authenticated')
  and (table_schema = 'public' or (table_schema = 'storage' and table_name = 'objects'))
order by review nulls last, table_schema, table_name, grantee, privilege_type;
```

```sql
select n.nspname as schema_name, c.relname as table_name, r.role_name,
       has_table_privilege(r.role_name,c.oid,'INSERT') as can_insert,
       has_table_privilege(r.role_name,c.oid,'UPDATE') as can_update,
       has_table_privilege(r.role_name,c.oid,'DELETE') as can_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'),('authenticated')) r(role_name)
where (n.nspname = 'public' and c.relname in ('push_subscriptions','owner_credit_ledger',
       'gateway_topups','gateway_webhook_events','profiles','bookings','customer_selfies'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by schema_name, table_name, r.role_name;
```

```sql
select a.attname as profile_column, r.role_name,
       has_column_privilege(r.role_name,c.oid,a.attnum,'UPDATE') as can_update
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join (values ('anon'),('authenticated')) r(role_name)
where n.nspname = 'public' and c.relname = 'profiles'
  and a.attname in ('license_path','id_path','verification','role','license_classes')
order by profile_column, r.role_name;
```

### A5. RLS on the same tables

**Safe:** RLS is enabled. Where browser reads exist, rows are limited to the caller, the relevant booking or owner, or an authorized admin. No browser policy grants unguarded booking or document writes. `gateway_webhook_events` should have no browser access. A leftover admin policy still needs an effective table grant to take effect.

**Unsafe:** Disabled RLS, a permissive policy exposing unrelated rows, or a policy and grant combination allowing direct protected writes. A missing policy can be a valid deny-by-default result.

```sql
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled,
       p.policyname, p.roles, p.cmd, p.permissive, p.qual, p.with_check
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where (n.nspname = 'public' and c.relname in ('push_subscriptions','owner_credit_ledger',
       'gateway_topups','gateway_webhook_events','profiles','bookings','customer_selfies'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by schema_name, table_name, p.policyname;
```

### A6. Security-definer functions, search paths, and EXECUTE

**Safe:** Server-only credit posting, checkout reservation, webhook processing, and document-upload authorization show false for `anon_execute`, `authenticated_execute`, and `public_execute`. Each sensitive function has an explicit search path. Review any schema on that path for untrusted CREATE privileges. A blank search path is an explicit setting.

**Current design exception:** The deployed fixes are designed to grant `authenticated` EXECUTE on guarded entry points such as the five-argument `admin_review_owner_topup`, admin verification RPCs and booking payment confirmation. Their bodies enforce admin or booking ownership as applicable. A blanket prohibition on `authenticated` EXECUTE for those entry points would fail against the intended code. Verify the exact signature and guard. Anonymous and PUBLIC execution should be false for these privileged entry points.

**Unsafe:** A browser role can execute a server-only function, PUBLIC can execute a privileged entry point, a protected entry point lacks its role or ownership check, or a sensitive definer function uses an implicit or user-writable search path.

```sql
select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner,
       (select setting from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%' limit 1) as search_path_setting,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       exists (select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
               where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute,
       (select string_agg(case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, ', ')
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.privilege_type = 'EXECUTE') as acl_execute_grantees
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
order by p.proname, p.oid::regprocedure::text;
```

### A7. Reference, proof, checkout, and webhook enforcement

**Safe:** `gateway_topup_checkout_attempt_idx` is unique across owner, provider, mode and non-null attempt key. Provider checkout IDs are unique within a provider. The webhook table’s key is `(provider,event_id)`. Different event IDs for the same checkout are allowed. The posting function locks the order and checks whether it already has a ledger entry, which prevents a second credit for that checkout.

Normalized manual reference and proof-path indexes are **non-unique by design**. Historical duplicates do not block migration. The submission and approval functions enforce reuse checks with transaction locks. Review the function definitions along with the indexes. Existing raw-reference uniqueness is separate from that enforcement.

**Unsafe:** A missing or invalid checkout or webhook index, missing locks or reuse checks, or a posting path that can add another credit to an already-linked checkout.

```sql
select t.relname as table_name, i.relname as index_name, x.indisunique as is_unique,
       x.indisvalid as is_valid, pg_get_indexdef(i.oid) as definition
from pg_index x join pg_class t on t.oid = x.indrelid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('owner_credit_ledger','gateway_topups','gateway_webhook_events')
order by t.relname, i.relname;
```

```sql
select c.relname as table_name, k.conname as constraint_name,
       k.convalidated as validated, pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('owner_credit_ledger','gateway_topups','gateway_webhook_events')
order by c.relname,k.conname;
```

```sql
select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.proname in
 ('normalize_topup_reference','owner_topup_proof_exists','submit_owner_topup',
  'admin_review_owner_topup','reserve_quickpay_checkout','record_gateway_event',
  'apply_quickpay_event','post_gateway_topup','admin_set_customer_verification',
  'admin_set_owner_payment_qr_verified','admin_review_customer_selfie','confirm_booking_payment')
order by p.proname,p.oid::regprocedure::text;
```

### A8. Profile and document triggers

**Safe:** The profile trigger `on_customer_documents_updated` is enabled for normal sessions. Its function resets verification to `pending` on a license or ID path change and clears verified license classes on a license change. Selfie replacement sets its status in the upload route. Storage immutability is enforced by A1, so a separate storage verification trigger is unnecessary.

**Unsafe:** The profile reset trigger is disabled, missing, or no longer resets approval. Codes `O` and `A` run in normal sessions. `D` is disabled and `R` is replica-only.

```sql
select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
       t.tgenabled as enabled_code, pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and (
   (n.nspname = 'public' and c.relname in ('profiles','customer_selfies'))
   or (n.nspname = 'storage' and c.relname = 'objects'))
order by schema_name, table_name, trigger_name;
```

### A9. Existing approved customers

The current schema stores profile document paths and an overall verification status. It does not record a separately approved path, file hash, or historical review snapshot for licenses and IDs. The counts below show whether paths and matching storage metadata exist today. They cannot establish that the current bytes are the bytes originally reviewed. A customer with approved status but missing paths can already fail the booking gate.

**Safe for continuity:** All approved customers have both current document paths and matching objects under their own account. There are zero flagged rows. Prior content integrity still needs evidence from a trusted backup or fresh review.

**Unsafe:** Any flagged row. Review it before rollout and keep identifiers private. The migration leaves existing status and path values intact.

```sql
with approved as (
  select p.id, nullif(btrim(p.license_path),'') as license_path,
         nullif(btrim(p.id_path),'') as id_path
  from public.profiles p where p.role = 'customer' and p.verification = 'approved'
), checks as (
  select a.*,
         exists (select 1 from storage.objects o
                 where o.bucket_id = 'customer-docs' and o.name = a.license_path
                   and starts_with(o.name,a.id::text || '/')) as license_object,
         exists (select 1 from storage.objects o
                 where o.bucket_id = 'customer-docs' and o.name = a.id_path
                   and starts_with(o.name,a.id::text || '/')) as id_object
  from approved a
)
select count(*) as approved_total,
       count(*) filter (where license_path is not null and id_path is not null) as both_paths_recorded,
       count(*) filter (where license_path is null or id_path is null) as missing_path,
       count(*) filter (where license_object and id_object) as both_owned_objects_present,
       count(*) filter (where not (license_object and id_object)) as flagged_for_review
from checks;
```

```sql
select p.id as customer_id,
       nullif(btrim(p.license_path),'') is null as missing_license_path,
       nullif(btrim(p.id_path),'') is null as missing_id_path,
       'Review approved document records privately' as review
from public.profiles p
where p.role = 'customer' and p.verification = 'approved' and (
  not exists (select 1 from storage.objects o where o.bucket_id = 'customer-docs'
    and o.name = p.license_path and starts_with(o.name,p.id::text || '/'))
  or not exists (select 1 from storage.objects o where o.bucket_id = 'customer-docs'
    and o.name = p.id_path and starts_with(o.name,p.id::text || '/')))
order by p.id;
```

## B. Preview acceptance checks

Use a preview linked to an isolated test Supabase project and QuickPay sandbox. Use fake documents and demo transfers. Create a customer, owner, and admin. Use a second fixture owner, or have the admin prepare a proof under a different owner, for the cross-owner check. Keep live data, credentials, push subscription URLs, and payment links out of screenshots and notes.

For negative permission checks, use a controlled QA fixture or the repository’s SQL regression suites on a disposable database. The steps below describe which operations to verify and what they should do. They do not require modifying browser credentials, probing network destinations, or sending custom webhooks to a deployed service.

### B1. Identity documents

1. As admin, approve the test customer with both documents present. As that customer, book an available test vehicle. **Expected:** The request advances to the booking payment page. **Failure:** The approved customer is blocked solely because the migration ran. Rule out an unrelated booking pause, unavailable vehicle, or missing document.
2. In the isolated preview permission fixture, check customer-role access to overwrite and delete the customer’s own approved license object in `customer-docs`. Check both operations separately. **Expected:** Both are denied and the object and profile are unchanged. **Failure:** The original object changes or disappears. A1 and A4 provide an independent privilege check on live.
3. Replace the license through **Account → Documents**. Compare the before and after paths privately using the preview dashboard. **Expected:** The new path differs, verification becomes `pending`, and verified license classes are cleared. **Failure:** The path stays the same or verification remains approved.
4. With that customer still pending, try a fresh booking for an available date. **Expected:** The booking is blocked and no new booking is created. **Failure:** The request reaches payment or appears in bookings.

### B2. Push subscriptions and delivery

1. In the isolated permission fixture, check direct subscription INSERT as an authenticated non-admin. **Expected:** Denied and no new row. **Failure:** A row appears through the direct write.
2. In a mocked registration test, use the approved-host case and the rejected destination classes separately. The rejected classes are unlisted HTTPS, loopback, link-local metadata addresses, and a redirecting URL on an unlisted host. **Expected:** Rejected inputs get HTTP 400 and no stored subscription or outbound request. **Failure:** An invalid destination is stored. See [push endpoint regression tests](tests/push-endpoint.test.mjs).
3. In the preview, sign in, enable notifications from a supported browser, and grant its browser permission. **Expected:** Registration succeeds, the device shows as subscribed, and a normal notification can arrive. **Failure:** A supported browser is rejected or the dispatch fails. Check the preview worker is actually configured before treating a missing notification as failure.
4. Confirm delivery behavior by inspection or with a network stub. [Push delivery](lib/notifications/push.ts#L31) sets a 5,000 ms socket timeout and uses the [checked DNS agent](lib/notifications/push-egress.ts). The installed `web-push` implementation uses one HTTPS request and treats non-2xx responses as failures. **Expected:** A stubbed HTTP redirect causes no second request. A stalled socket times out. **Failure:** It contacts a redirect target or the socket stays open past the configured timeout. Registration does not fetch the endpoint, so an otherwise allowed provider URL is not rejected at registration merely because it might later return a redirect. The timeout is a socket timeout. It does not prove a 5-second end-to-end deadline.

### B3. Manual top-ups

1. In an isolated owner-role fixture, check a submission whose proof belongs to the other fixture owner. **Expected:** “Upload a valid top-up proof for this owner.” No pending row is created. **Failure:** A pending row is created for the wrong owner’s proof.
2. In the preview, submit a valid top-up using a fake proof and a fresh reference. Use a different fake proof for a second submission whose reference differs only by case, spaces, or dashes. **Expected:** The first appears as pending. The second says “That top-up reference or proof has already been used.” **Failure:** The second appears as another pending row.
3. In an isolated fixture, try to attach the first submission’s existing proof path to a different reference. **Expected:** The reuse is rejected. **Failure:** Another row attaches the same proof path. Uploading the same image under a different path is a different condition and is not checked by file content.
4. As admin, open **Owner top-ups**. Enter a different amount from the claim while keeping the reference matching. **Expected:** The entered amount remains visible and **Post credits** stays disabled. The current UI does not show a separate mismatch message for this field. The RPC rejects mismatched attestation with “Enter the amount and reference from the verified transfer.” No credit is posted. **Failure:** The amount is overwritten, approval becomes available for the mismatch, or the balance increases.
5. Enter the matching amount and reference from the demo transfer and approve. **Expected:** One approved entry and one balance increase for the claimed amount. **Failure:** The amount changes, or the row remains pending after a confirmed success.

### B4. QuickPay checkout and webhook idempotency

1. As the owner, open **Credits → Top up credits**. In browser DevTools Network, preserve the log and double-click **Continue to payment**. **Expected:** One checkout opens. The browser normally suppresses the second click. Concurrent matching requests handled by the server share one order. An in-progress response is HTTP 409 with a Retry-After header. **Failure:** Two distinct orders are reserved for one attempt.
2. In a fresh sandbox attempt, simulate loss of the checkout response. Check credits, then reopen the chooser in the **same browser tab** with the same amount and payment method. Compare the request header values privately. **Expected:** The same `Idempotency-Key` is sent. Once the existing checkout is saved, the server returns its URL. If creation is still leased, wait and use the same selection again. **Failure:** The retry generates another key or reserves a second order. The form locks after an uncertain response, so retrying may require reopening it.
3. In the checkout regression fixture, compare responses when the same attempt key is associated with a changed amount. **Expected:** HTTP 409, code `attempt_mismatch`, and no second checkout. **Failure:** The changed amount creates or changes an order. The normal chooser uses a different slot for different inputs, so changing the amount in the UI alone does not exercise this guard.
4. Use the provider’s own duplicate-delivery test control if available, or review the mock-backed webhook replay regression. **Expected:** Two deliveries of the same sandbox event ID result in one ledger credit for the order. **Failure:** There is more than one balance increase. The repo exposes a signed webhook receiver, and this review did not confirm a sandbox simulate endpoint. Avoid sending fabricated or manually signed events to the preview.
5. Locate the implementation at [attempt key generation](components/owner/online-topup.tsx#L20), [request header](components/owner/online-topup.tsx#L54), and [upstream checkout idempotency](lib/payments/quickpay.ts#L94). The browser uses a UUID per amount and payment method slot, stored for reuse in that tab. The upstream key is the persisted order ID. [Checkout regressions](tests/quickpay.test.mjs) · [SQL checkout regressions](supabase/tests/gateway_topups.sql)

### B5. Promo click analytics

1. Open a demo listing’s promo link and confirm it redirects to the expected vehicle. **Expected:** If analytics is available and the click qualifies, a click row is recorded. Cookie deduplication may suppress repeat clicks before the database cap is reached. **Failure:** A valid promo link does not redirect.
2. Use the disposable quota fixture for a single caller and vehicle within one database minute. **Expected:** At most 20 counted clicks for that caller in the minute. The separate vehicle cap is 120 per minute across callers. The preview link continues to redirect at the cap. **Failure:** The count exceeds the applicable limit or the redirect fails. [Promo quota fixture](supabase/tests/promo_click_limits.sql)
3. Use a preview test stub that returns an analytics error or exceeds the 1.5-second analytics deadline. Keep the listing lookup available. **Expected:** Redirect to the same vehicle, without recording a click when analytics is unavailable. **Failure:** An analytics error prevents or changes the redirect. A failed listing lookup is a separate case.

## C. Verification report

This task used source reads and Git status only. I did not run SQL, application tests, a preview, or live checks. Earlier test results are outside this verification task.

| Fix | Application files | Migrations | Verified in this task |
|---|---|---|---|
| Identity documents | [Upload route](app/api/account/documents/route.ts), [audited document access](lib/audit/actions.ts) | `202611270002_secure_document_and_push_writes.sql`, existing reset trigger from `202611030001_customer_portal.sql` and `202611210007_testing_profile_refresh.sql` | Code reading only |
| Push | [Subscription route](app/api/push/subscribe/route.ts), [destination validation](lib/notifications/push-endpoint.ts), [egress](lib/notifications/push-egress.ts), [delivery](lib/notifications/push.ts) | `202611270002_secure_document_and_push_writes.sql` | Code and installed library reading only |
| Manual top-ups | [Proof submission](components/owner/submit-credit-proof.ts), [admin review](components/admin/payment-admin.tsx) | `202611270003_secure_manual_topups.sql` | Code reading only |
| QuickPay | [Checkout form](components/owner/online-topup.tsx), [checkout route](app/api/payments/topup/create/route.ts), [gateway client](lib/payments/quickpay.ts), [webhook receiver](app/api/payments/quickpay/webhook/route.ts) | `202611270001_gateway_topups_quickpay.sql`, `202611270004_idempotent_quickpay_checkout.sql` | Code reading only |
| Promo analytics | [Promo redirect](app/c/%5Bcode%5D/route.ts) | `202611270005_limit_public_promo_clicks.sql` | Code reading only |

### What remains unverified

- Live grants, policies, bucket visibility, function ACLs, and the approved-customer counts require running Part A against the live project.
- Preview role checks, real browser subscription and delivery, QuickPay sandbox recovery and provider replay support require the isolated preview and test accounts. No provider dashboard was consulted.
- Existing document bytes cannot be matched to what reviewers originally saw using the current schema. Storage metadata confirms a pointer has an object entry. It cannot authenticate its history.

### Remaining risks

| Rank | Risk |
|---|---|
| **High** | Earlier approved documents may have changed before immutability took effect. Existing approvals are preserved, and the schema has no historical reviewed hash to distinguish previously altered files. This exposure is conditional. No alteration was established. |
| **Medium** | Manual reconciliation depends on an admin checking the actual payment account. Reusing the same image bytes under a new path is not detected, and matching typed values alone do not prove an external transfer. |
| **Medium** | Browser attempt keys are scoped to a tab and selection. Different tabs or selections can create separate attempts. The server protects repeats of the same key. |
| **Low** | Promo quotas trade accuracy for bounded writes. Shared proxy addresses, missing trusted IP metadata, or a busy vehicle can suppress valid analytics while the link remains usable. |
| **Low** | Push delivery uses a socket timeout. DNS and end-to-end timing depend on the deployment. Existing subscriptions for unsupported hosts may be retained but are skipped at delivery. |

### Migration order and existing data

Apply with the matching app release. Earlier app versions use some of the direct write paths these migrations revoke.

| Order | File | Existing-data behavior |
|---|---|---|
| 1 | [202611270002_secure_document_and_push_writes.sql](supabase/migrations/202611270002_secure_document_and_push_writes.sql) | Changes grants and policies. Existing documents, approvals, and subscription rows are preserved. Check historical approvals separately. |
| 2 | [202611270003_secure_manual_topups.sql](supabase/migrations/202611270003_secure_manual_topups.sql) | The lookup indexes are non-unique, so historical duplicates do not block creation. A legacy pending row with missing proof or a previously posted matching reference or proof can fail approval after deployment. |
| 3 | [202611270004_idempotent_quickpay_checkout.sql](supabase/migrations/202611270004_idempotent_quickpay_checkout.sql) | Adds nullable columns. Existing orders have no attempt key and are excluded from the new partial unique index. |
| 4 | [202611270005_limit_public_promo_clicks.sql](supabase/migrations/202611270005_limit_public_promo_clicks.sql) | Adds a quota RPC using the existing limiter table. Historical promo clicks remain intact. |

No migration above is expected to fail merely because legacy rows exist in the repository’s expected schema. Missing prerequisites, different live object definitions, or overlapping deployments can still cause failure. In particular, the checkout migration requires `202611270001_gateway_topups_quickpay.sql`, which adds its provider fields and event table.
