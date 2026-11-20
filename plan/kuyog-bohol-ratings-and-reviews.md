# Kuyog Bohol — Ratings & Reviews After a Trip (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase, Resend).
**Goal:** after a trip, the customer can rate the vehicle and the owner. Reviews show on vehicle pages and cards, owners can reply, admins can hide abusive reviews. Works for **cars and motorcycles** (`kuyog-bohol-motorcycles.md`).
**Related specs:** `kuyog-bohol-audit-log.md`, `kuyog-bohol-sweetalert.md`, `kuyog-bohol-auto-animate.md`, `kuyog-bohol-user-onboarding.md`, `kuyog-bohol-security-audit-verified.md`, `kuyog-bohol-admin-email-alerts.md`.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing routes, server actions or caching code, and follow the existing patterns in the repo.

---

## 0. What exists today (verified in the repo)

- `public.reviews` exists (migration `202611050001_phase3.sql`): `id, booking_id (unique), customer_id, car_id, owner_id, rating smallint 1..5, comment, created_at`. Index `reviews_car_created_idx (car_id, created_at desc)`.
- RLS: **anyone can select** (`using (true)`); customers can insert only for their own booking with `status = 'completed'` and matching `car_id` / `owner_id` (`202611050004_security_rls.sql`); admins manage all; `update, delete` are granted to `authenticated` but only the admin policy allows them.
- **No UI writes or reads `reviews`**: no rating form, no review list on `/cars/[id]`, no rating on cards, no prompt, no owner reply, no moderation.
- Booking statuses: `pending, confirmed, picked_up, returned, completed, cancelled, rejected`. `completed` is set **manually by the owner** with the *Complete* button after `returned` (`components/owner/booking-workflow.tsx`). If owners forget, customers can never review. This spec fixes that (section 3).
- Notifications use `notify()` / `notify_admins()` (service role / triggers), channels `in_app, email, push`.

Problems to fix in the existing table:
1. `select using (true)` exposes `customer_id` and the raw comment to anonymous users. Public reads must go through a **view** that shows first name and initial only.
2. Nothing stops a customer from editing or deleting; fine, but there is also no edit window, no length limit, no moderation fields.
3. No aggregate columns, so average rating would require scanning reviews on every card.

## 1. Decisions

| Topic | Decision |
|---|---|
| Who can review | The customer of a booking, once, after it is `completed` (or auto-completed, section 3) |
| What is rated | **Vehicle** (1–5, required) and **Owner / service** (1–5, optional), plus an optional comment (max 1000 chars) and optional quick tags |
| Edit window | Customer can edit within **7 days** of posting (once), cannot delete; admin can hide |
| Visibility | Public on `/cars/[id]` and card averages. Shows **first name + last initial** only, trip month, vehicle |
| Owner reply | One public reply per review (max 500 chars), editable for 7 days |
| Moderation | Admin can hide or unhide with a reason; customers and owners can **report** a review. Hidden reviews do not count toward averages |
| Anti-abuse | Only real completed bookings; one review per booking; rate limit; no HTML; no links in comments |
| Minimum shown | Show the average only when there are **3 or more** reviews (otherwise "New"), to avoid one review defining a listing |
| Reviews are never deleted by owners | Owners can reply and report, not remove |

## 2. Database (migration `202611200003_reviews.sql`)

Alter the existing table (do not recreate it):

```sql
alter table public.reviews
  add column if not exists owner_rating smallint check (owner_rating between 1 and 5),
  add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 5),
  add column if not exists edited_at timestamptz,
  add column if not exists owner_reply text check (char_length(owner_reply) <= 500),
  add column if not exists owner_reply_at timestamptz,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_by uuid references public.profiles(id),
  add column if not exists hidden_at timestamptz;

alter table public.reviews
  add constraint reviews_comment_len check (comment is null or char_length(comment) <= 1000);
-- Allowed tags are validated in the RPC against a fixed list, e.g.
-- 'clean','as_described','smooth_pickup','fair_price','friendly_owner','on_time','needs_improvement'

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','offensive','personal_info','fake','other')),
  note text check (char_length(note) <= 300),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index review_reports_open_idx on public.review_reports (status, created_at);
alter table public.review_reports enable row level security;
revoke all on public.review_reports from anon, authenticated;
grant select on public.review_reports to authenticated;
create policy "Admins read review reports" on public.review_reports for select to authenticated using (public.is_admin());
```

Aggregates (denormalised, kept in sync by a trigger so cards are cheap):

```sql
alter table public.cars
  add column if not exists rating_avg numeric(3,2) not null default 0,
  add column if not exists rating_count int not null default 0;
alter table public.owners
  add column if not exists rating_avg numeric(3,2) not null default 0,
  add column if not exists rating_count int not null default 0;

create or replace function public.refresh_review_aggregates(p_car uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.cars set
    rating_avg = coalesce((select round(avg(rating)::numeric,2) from public.reviews where car_id = p_car and not is_hidden),0),
    rating_count = (select count(*) from public.reviews where car_id = p_car and not is_hidden)
  where id = p_car;
  update public.owners set
    rating_avg = coalesce((select round(avg(coalesce(owner_rating, rating))::numeric,2) from public.reviews where owner_id = p_owner and not is_hidden),0),
    rating_count = (select count(*) from public.reviews where owner_id = p_owner and not is_hidden)
  where id = p_owner;
end $$;
revoke all on function public.refresh_review_aggregates(uuid,uuid) from public, anon, authenticated;

create or replace function public.reviews_aggregate_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_review_aggregates(coalesce(new.car_id, old.car_id), coalesce(new.owner_id, old.owner_id));
  return null;
end $$;
revoke all on function public.reviews_aggregate_trigger() from public, anon, authenticated;
create trigger reviews_aggregate after insert or update or delete on public.reviews
  for each row execute function public.reviews_aggregate_trigger();
```

Important: the **owners trigger** that guards sensitive owner columns must allow these two aggregate columns to be written by the definer function (use the `app.plan_sync`-style bypass already used in the plans spec, or add the columns to the allowed list). Check this against the existing `owners` update guard before applying. Backfill the aggregates for existing rows at the end of the migration.

Public read through a view (customer identity protected), and **remove public access to the raw table**:

```sql
create or replace view public.public_reviews with (security_barrier = true) as
select r.id, r.car_id, r.owner_id, r.rating, r.owner_rating, r.tags, r.comment,
       r.owner_reply, r.owner_reply_at, r.created_at,
       coalesce(split_part(p.full_name,' ',1),'Customer') || ' ' ||
         coalesce(nullif(left(split_part(p.full_name,' ',2),1),'') || '.','') as reviewer_name,
       to_char(b.start_date,'Mon YYYY') as trip_month
from public.reviews r
join public.bookings b on b.id = r.booking_id
join public.profiles p on p.id = r.customer_id
join public.cars c on c.id = r.car_id and c.is_active
where not r.is_hidden;

revoke select on public.reviews from anon;
drop policy if exists "Customers can read reviews" on public.reviews;
grant select on public.public_reviews to anon, authenticated;
create policy "Read own or related reviews" on public.reviews for select to authenticated
  using (customer_id = (select auth.uid())
         or owner_id in (select id from public.owners where profile_id = (select auth.uid()))
         or public.is_admin());
```

(Adjust the owner-to-profile column name to the real schema. The view runs as its owner, so it can read `profiles` and `bookings`; it exposes only the fields listed. Confirm the view does not leak `customer_id`.)

Write paths: **only through definer RPCs** (so validation, edit window and notifications live in one place). Revoke direct `insert, update, delete` on `reviews` from `authenticated` and drop the old insert policy; keep the admin policy.

```sql
-- Customer posts a review
create function public.submit_review(p_booking uuid, p_rating int, p_owner_rating int, p_comment text, p_tags text[])
returns uuid ...  -- security definer, set search_path = public
```
Checks, in order: `auth.uid()` is the booking's customer; booking `status = 'completed'`; no existing review; `p_rating` 1–5; `p_owner_rating` null or 1–5; comment trimmed, ≤ 1000 chars, **no URLs or HTML** (reject `http`, `www.`, `<`); tags are all in the allowed list; customer has not posted more than 5 reviews in the last hour. Insert with `car_id`/`owner_id` taken **from the booking**, never from the client. Errors use stable codes: `REVIEW_NOT_ALLOWED`, `REVIEW_EXISTS`, `REVIEW_INVALID`, `REVIEW_RATE_LIMIT`.

```sql
create function public.edit_review(p_review uuid, p_rating int, p_owner_rating int, p_comment text, p_tags text[])  -- own review, within 7 days, only if edited_at is null; sets edited_at
create function public.reply_to_review(p_review uuid, p_reply text)       -- owner of that review's car only; sets owner_reply, owner_reply_at; editable within 7 days
create function public.report_review(p_review uuid, p_reason text, p_note text)  -- any signed-in user except the reviewer; one report per user per review
create function public.admin_moderate_review(p_review uuid, p_hide boolean, p_reason text)  -- admin only; requires reason when hiding; calls audit_write
create function public.admin_resolve_review_report(p_report uuid, p_action text)  -- 'dismissed' | 'actioned'
```
All: `security definer`, `set search_path = public`, `revoke ... from public, anon`, `grant execute ... to authenticated` (admin ones check `is_admin()` inside). Each owner or admin write is audit logged (audit log spec) with `app.audit_reason` where relevant.

Notifications (use `notify()` / `notify_admins()` inside the RPCs, deduped):
- `review_received` to the owner: "New {n}-star review for {vehicle}" with link `/owner/reviews`.
- `review_reply` to the customer: "{Owner} replied to your review" with link `/account/bookings`.
- `review_reported` to admins (and `admin_alert('review.reported', ...)` as **Digest** per the admin alerts spec) with link `/admin/reviews`.
- `review_hidden` to the reviewer (in-app only) with the neutral reason text.
- Never put comment text in email bodies.

## 3. Making sure customers can actually review

Because owners must press *Complete*, add two safeguards:
1. **Auto-complete:** a cron job `auto_complete_returned_bookings()` (pg_cron, hourly) sets `status = 'completed'` for bookings that have been `returned` for **48 hours**, using the same transition checks as the existing function. Log to `booking_status_events` if that table exists. Owners can still complete manually earlier.
2. **Review prompt notification:** a trigger on `bookings` when `status` changes to `completed` calls `notify(customer, 'review_prompt', 'How was your trip?', 'Rate {vehicle} and {owner}', '/account/bookings?review={booking_id}', channels {in_app,email,push})`. Send a **single reminder after 3 days** if no review (cron, `dedupe` per booking). No more than two prompts per booking.

Reviewing stays open for **60 days** after completion (enforced in `submit_review`).

## 4. Customer UI

1. **Bookings list** (`components/customer/booking-list.tsx`): on `completed` bookings show a **Rate your trip** button. After reviewing, show the stars and **Edit** (while allowed). Opening `/account/bookings?review=<id>` opens the dialog directly.
2. **ReviewDialog** (`components/reviews/ReviewDialog.tsx`, client):
   - Vehicle rating: 5 star buttons as a `radiogroup` (large touch targets, keyboard arrows, labels *Poor, Fair, Good, Very good, Excellent*).
   - Owner rating (optional), same control.
   - Quick tags as toggle chips (max 5), comment textarea with a live counter (1000), helper text *Don't share phone numbers or links.*
   - Submit uses the SweetAlert/toast helpers from the sweetalert spec, friendly errors for the stable codes, a thank-you state, and a loading state (`kuyog-bohol-loading-indicators.md`).
   - Works at 390px; the dialog is a bottom sheet on mobile.
3. **Server action** `app/account/bookings/review-actions.ts`: validates with zod (same rules as the RPC), calls the RPC with the user's session (never service role), returns `{ ok } | { error: code }`. Revalidate the vehicle page and the bookings page.

## 5. Public UI

1. **Vehicle page `/cars/[id]`:** new **Reviews** section below the description:
   - Header: big average, star bar, count, and a 5-row distribution bar (5★…1★). If `rating_count < 3`, show *New listing · {n} reviews* instead of the average.
   - Tag summary (*Clean · 12*, *As described · 9*).
   - List sorted newest first (toggle **Highest / Lowest**), 10 per page with **Load more** (keyset by `created_at, id`). Each review: stars, reviewer name, trip month, tags, comment, owner reply (indented, labelled with the owner's business name), *Report* link (signed-in users only).
   - Empty state: *No reviews yet. Reviews appear after completed trips.*
   - Add `AggregateRating` JSON-LD to the page **only** when `rating_count >= 3`, built from database values, never from client input.
2. **Cards** (`/cars`, landing featured, owner and promo pages): small `★ 4.8 (23)` when `rating_count >= 3`, otherwise nothing or a *New* chip. Read `cars.rating_avg/rating_count` (no extra queries). Add **sort by rating** and a **minimum rating** filter on `/cars` (query params `sort=rating`, `rating=4`).
3. **Owner public info:** show owner average on the vehicle page owner block, same 3-review minimum.
4. Escape all text (React default); never use `dangerouslySetInnerHTML`.

## 6. Owner UI

- New page **`/owner/reviews`**: summary (average, count, last 30 days), list of reviews for their vehicles with filter *Needs reply / All / Reported*, **Reply** inline form (500 chars, 7-day edit), **Report** action for unfair reviews. Link it in the owner nav and add a badge for unanswered reviews.
- Owner dashboard card: *Rating {avg} · {count} reviews · {n} to reply*.
- Onboarding checklist (`kuyog-bohol-user-onboarding.md`): optional item *Reply to your first review*.
- Owners **cannot** see more than the public view plus the booking link. No customer contact details.

## 7. Admin UI

- New page **`/admin/reviews`** (add to the admin nav with a count badge of open reports): tabs **Reported / All / Hidden**, filters by owner, vehicle, rating, date; row shows review text, rating, owner, vehicle, report reasons and counts.
- Actions with a SweetAlert confirm: **Hide** (reason required: spam, offensive, personal info, fake, other plus note), **Unhide**, **Dismiss report**, **Mark actioned**. Every action is audit logged and shows in EntityHistory for the owner and vehicle.
- Overview card on `/admin`: *Reviews waiting: {n} reported*; add the count to the daily digest "Waiting for you".
- A hidden review is still visible to its author with a note *This review was hidden by moderators*.

## 8. Security and privacy

- Writes only through RPCs; all inputs validated in the database and in the server action (defense in depth).
- `car_id` and `owner_id` always derived from the booking; clients cannot choose them.
- Public reads only through `public_reviews` (first name and initial); no `customer_id`, email, phone or booking details are exposed.
- Comments: length limit, no links or HTML, escaped on render, never placed in emails or push text.
- Rate limits and one-review-per-booking guarantee (unique constraint plus RPC check).
- Ratings cannot be changed by owners; owners only reply. Only admins hide, with reasons and an audit trail.
- No new `anon` EXECUTE grants; `anon` loses direct `select` on `reviews`.
- Reports cannot be spammed (unique per user and review; rate limit 10 per day).
- Fake-review safeguards are limited to real completed bookings; a review from a booking the owner and customer arranged outside the app is out of scope, and admins can hide suspected cases.

## 9. Test plan

SQL (role switching and JWT claims):
1. Customer with a `completed` booking can submit; with `returned`, `confirmed` or someone else's booking → `REVIEW_NOT_ALLOWED`.
2. Second review for the same booking → `REVIEW_EXISTS`. Rating 0 or 6 → `REVIEW_INVALID`. Comment with `http://` or `<script>` → rejected. Client-supplied `car_id` is ignored.
3. After 60 days post-completion → rejected. Edit works once within 7 days, fails after or a second time.
4. Owner can reply only to reviews of their own vehicles; another owner → rejected; reply over 500 chars → rejected.
5. `anon` cannot select from `reviews`; `anon` can select from `public_reviews` and it contains no `customer_id`; hidden reviews are absent from the view and from aggregates.
6. Aggregates: insert, edit, hide, unhide and delete update `cars` and `owners` averages and counts correctly; backfill matches a manual query.
7. Non-admin cannot call moderation RPCs; hiding requires a reason; each action writes an audit row.
8. Auto-complete moves a booking `returned` for 48 h to `completed`, not before, and fires the review prompt once; the 3-day reminder fires once.
9. Reports: one per user per review; the reviewer cannot report their own review.

App:
- Booking list shows **Rate your trip** only for completed, unreviewed bookings; dialog keyboard and screen reader behavior works (radiogroup, focus trap, Esc).
- Vehicle page shows average only with 3 or more reviews, distribution is correct, *Load more* paginates without duplicates.
- Owner reply appears under the review; report flow reaches `/admin/reviews`; hide removes it from public pages and cards after revalidation.
- JSON-LD is present only with 3 or more reviews.
- XSS test: a comment like `<img src=x onerror=alert(1)>` renders as plain text everywhere.
- 390px layout for dialog, review list, owner and admin pages; no horizontal scroll.
- Existing booking flows, payments, notifications and the owners update guard still work.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 10. Build order (one commit per step)

1. Migration: new columns, `review_reports`, aggregates and trigger (check the owners guard), `public_reviews` view, grants, RPCs, backfill; SQL tests 1 to 7 and 9.
2. Auto-complete cron, review prompt and reminder notifications; test 8.
3. Customer ReviewDialog, server actions, bookings list integration.
4. Public reviews section on `/cars/[id]`, card ratings, sorting and filter on `/cars`, JSON-LD.
5. Owner `/owner/reviews`, reply and report, dashboard card.
6. Admin `/admin/reviews`, moderation, digest and overview counts.
7. Polish: AutoAnimate on lists, SweetAlert confirms, loading and empty states, accessibility and mobile pass.

## 11. Acceptance checklist

- [ ] A customer can rate a completed trip (vehicle, optional owner, tags, comment) once and edit it within 7 days.
- [ ] Bookings reach `completed` automatically 48 h after `returned` if the owner forgets; the customer gets a prompt and one reminder.
- [ ] Vehicle pages list reviews with distribution, tags, owner replies and pagination; cards show `★ avg (count)` after 3 reviews.
- [ ] `/cars` can sort by rating and filter by minimum rating.
- [ ] Owners can reply and report; admins can hide, unhide and resolve reports with reasons; everything is audit logged.
- [ ] The public sees only first name and initial; `reviews` is not directly readable by `anon`; no customer contact data leaks.
- [ ] Only real, completed, own bookings can be reviewed; one per booking; links and HTML are rejected.
- [ ] Aggregates stay correct on insert, edit, hide and delete.
- [ ] Mobile, keyboard and screen reader checks pass; loading, empty and error states exist.
- [ ] Lint, typecheck, build and all tests pass.

## 12. Codex prompt

*"Implement ratings and reviews following `kuyog-bohol-ratings-and-reviews.md`. First read `supabase/migrations/202611050001_phase3.sql` and `202611050004_security_rls.sql` (existing `reviews` table and policies), the bookings status transition functions, `components/customer/booking-list.tsx`, `components/owner/booking-workflow.tsx`, the owners update guard trigger, and `app/cars/[id]`, and follow the repo's patterns (read the Next.js 16 docs in `node_modules/next/dist/docs/` first). Alter the existing table, do not recreate it. Make all writes go through definer RPCs and public reads through the `public_reviews` view. Build in the order of section 10, one commit per step. Never trust client-supplied ids, never expose customer identity beyond first name and initial, and escape all text. Run lint, typecheck, build and the SQL tests, and list anything you could not verify."*
