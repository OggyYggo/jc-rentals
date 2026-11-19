# Kuyog Bohol — "Choose your plan" Step on the Apply Page (Implementation Spec for Codex)

**Route:** `/apply` (existing page and server action; extend them, do not rebuild).
**Design source:** Claude Design canvas boards **Apply: Desktop**, **Apply: Mobile**, **Apply: Received** (all updated with the plan step).
**Depends on:** `kuyog-bohol-pricing-and-plans.md` (the `plans` table, `owner_plans`, `/owner/plan`). **Extends:** `kuyog-bohol-apply-page-implementation.md` and `kuyog-bohol-owner-application.md`. Where they disagree, this file wins for the points below.

**Goal:** the applicant sees the plans first, picks one (Starter by default), then fills in the form. **Nobody pays at application.** A paid plan is paid only after the admin approves the application, from the owner dashboard.

---

## 1. Flow

1. Applicant opens `/apply` (or `/apply?plan=standard` from the pricing page).
2. **Step 1, Choose your plan:** three selectable cards, Starter preselected. A note says *You pay nothing now.*
3. Steps 2 to 5: About you, Your car, How you rent it, Photos and documents (these were 1 to 4 before; **renumber them 2 to 5**).
4. Submit. The server saves the application with `preferred_plan`.
5. **Received page** confirms the chosen plan and explains payment comes later.
6. Admin reviews the application and sees the chosen plan.
7. On approval the owner is created on **Starter** (always). The welcome page and the invite email mention the chosen plan.
8. If the plan is paid, `/owner/welcome` shows **Activate Standard** which opens `/owner/plan?choose=standard`. The owner pays by QR, the admin confirms, the plan activates (see the plans spec, section 3.9).

Rules:
- No payment, no QR, no proof upload on the Apply page.
- Choosing a plan never changes the approval decision.
- The chosen plan is a **preference**. The only way a plan becomes active is the admin-confirmed payment flow.

## 2. UI (match the design boards)

### 2.1 Step 1 section
- Same section header pattern as the other steps: blue number circle **1**, title **Choose your plan**, sub text *Start free and upgrade when you need more cars.*
- **Cards:** 3 columns on desktop (gap 16px), stacked on mobile (gap 16px). Each card is one `<button type="button" role="radio" aria-checked>` inside a `role="radiogroup"` with label "Plan". Arrow keys move between cards; Space or Enter selects. Visible focus ring `#2E9BF0`, 3px, offset 3px.
- **Card content (top to bottom):** radio dot + plan name (Inter 18px, 700), price (Inter 30px, 800, `#0A3D91`, with `/ month` in 14px `#51657F`; show **Free** for price 0), two chips (`up to N cars`, `X% commission`, 13px 600, background `#EAF4FF`, text `#0A3D91`, no wrapping), short description (14px `#51657F`).
- **Most popular** pill sits on the top edge of the featured card (absolute, top −12px, right 16px, blue `#0B63CE`, white text, 11px, letter-spacing 1.2px, no wrapping). Show it for the plan with `is_featured = true`.
- **States:** selected = 2px `#0B63CE` border, background `#F3F9FF`, radio dot filled (6px blue ring); unselected = 2px `#D6E6F7` border, white background, dot with 2px `#B7CDE6` border. Hover on unselected: border `#0B63CE`. Radius 18px, padding 20px, equal heights.
- **Note under the cards** (info box, `#EAF4FF`, shield icon): **You pay nothing now.** *If you pick a paid plan, you pay only after we approve your application. You can change your plan any time.* plus a **Compare plans** link to `/pricing` that opens in a new tab (`target="_blank" rel="noopener"`).
- Default selection: the `plan` query param if valid, else `starter`.
- The plan chip also appears in the sticky sidebar and in the final summary line above the Submit button on mobile: *Plan: Standard · Change* (the link scrolls back to step 1).

### 2.2 Other copy changes
- Sidebar **What happens next**, step 3 now reads: *Approved? You get an email to set your password. You start on Starter, or pay to activate the plan you chose.*
- Step pills in the header band stay: Send your application, We review it, Start earning.

### 2.3 Received page (`/apply/received`)
- Add a plan card below the three "what happens" rows and above the buttons: star icon tile, title **Your chosen plan: {Plan name}**, text *You pay nothing now. After we approve you, open **Plan** in your owner dashboard to pay and activate it. Until then you start on Starter ({starter max cars} cars).* For Starter show only: *You are starting on the Starter plan. You can upgrade any time after approval.*
- Read the plan from the saved application (not from the URL).

## 3. Data

### 3.1 Migration `202611190002_application_preferred_plan.sql`
```sql
alter table public.owner_applications
  add column preferred_plan text not null default 'starter'
  check (preferred_plan ~ '^[a-z][a-z0-9_]{1,30}$');
```
Do **not** add a foreign key to `plans` (a plan may be retired later); validate in the server action. Keep the existing rule: only the service role inserts applications (insert stays revoked from `anon` and `authenticated`).

### 3.2 Reading plans on the Apply page
- `app/apply/page.tsx` (server component) loads public plans: `select code, name, price_php, max_active_cars, commission_rate, is_featured from plans where is_public and is_active order by sort_order`. The `plans` table must allow `anon` to read public rows (plans spec, section 3.10).
- Pass the list to the client form as props. **Never hard-code prices, limits or rates** in React.
- Validate the `?plan=` query param against that list; ignore invalid values (no error).

### 3.3 Server action (`app/apply/actions.ts`)
- Add `preferred_plan` to the zod schema: `z.string().regex(/^[a-z][a-z0-9_]{1,30}$/)`.
- On the server, re-load the public plans and check the code is in the list; if not, silently fall back to `starter`. Never trust a price or limit sent by the browser (the form sends only the **code**).
- Save `preferred_plan` with the rest of the application, using the existing service-role insert, Turnstile check and rate limit. Nothing else about the flow changes.
- Add `preferred_plan` to the confirmation email to the applicant and the notification to admins (*New application from {name}, plan: {Plan name}*).

## 4. Admin and owner changes

- **`/admin/owner-applications`:** show a **Plan** chip in the list and the detail page (*Wants Standard*). Add a filter "Wants a paid plan". Approval still creates the owner on Starter. Do not auto-activate anything.
- **Approval email** (`inviteUserByEmail` follow-up message or the welcome email): add a line when `preferred_plan` is not `starter`: *You chose the {Plan name} plan. After you sign in, open Plan to activate it.*
- **`/owner/welcome`:** if the owner's application had a paid `preferred_plan` (look it up via `owner_applications.user_id = auth.uid()`), show a card **Activate {Plan name}** with price, limits, and a button to `/owner/plan?choose={code}`. Hide it once the plan is active or the plan code no longer exists.
- **`/owner/plan?choose={code}`:** open the pay drawer with that plan preselected (validate the code; fall back to the plan list).
- Keep the **Pricing** link in the footer, For owners and Apply pages (plans spec, section 2). The pricing page buttons now go to `/apply?plan={code}` for visitors who are not owners.

## 5. Accessibility, loading and errors

- The group has a visible label, each card has an accessible name (*Standard plan, 499 pesos a month, up to 10 cars, 3 percent commission*), selected state is not conveyed by color alone (filled radio dot plus border).
- Respect `prefers-reduced-motion` (no animated selection effects beyond color change, 150ms).
- If plans fail to load, show only the Starter card with a small notice and still allow submitting (`preferred_plan = starter`). Never block applications because of the plan list.
- Form errors, loading buttons and Turnstile keep the existing behavior.
- Selecting a plan must not scroll the page or move focus.

## 6. Security

- `preferred_plan` is a preference only; it cannot change a price, limit or commission. Those come from the database after an admin-confirmed payment.
- Validate and normalize on the server; unknown codes fall back to `starter`.
- No new public write paths. The application insert stays service-role only; the new column has no direct grant to `anon` or `authenticated`.
- Escape the plan name in emails (it is admin-controlled but still data).
- Do not log applicant details or plan choices to the console.

## 7. Files

```
app/apply/
  page.tsx                  // loads public plans, reads ?plan=, passes props
  ApplyForm.tsx             // adds step 1, renumbers sections, plan state
  PlanPicker.tsx            // radiogroup of cards (new)
  actions.ts                // validates preferred_plan, saves it
app/apply/received/page.tsx // shows the chosen plan card
app/admin/owner-applications/ // plan chip, filter, email/notification text
app/owner/welcome/page.tsx  // "Activate {Plan}" card
supabase/migrations/202611190002_application_preferred_plan.sql
```

## 8. Acceptance checklist

- [ ] `/apply` shows **Choose your plan** as step 1 with Starter selected, and the other steps are numbered 2 to 5.
- [ ] `/apply?plan=standard` preselects Standard; `?plan=banana` is ignored.
- [ ] Prices, limits, commissions and the "Most popular" pill come from the `plans` table.
- [ ] Cards work with mouse, touch and keyboard (arrow keys, Space/Enter) and expose radio semantics.
- [ ] The note says nothing is paid now; **Compare plans** opens `/pricing` in a new tab.
- [ ] Submitting saves `preferred_plan`; an invalid or retired code saves `starter`.
- [ ] The received page, the applicant email and the admin notification show the chosen plan.
- [ ] Admin list and detail show the plan chip; approval creates the owner on Starter.
- [ ] A paid choice shows **Activate {Plan}** on `/owner/welcome` and opens `/owner/plan?choose=...`.
- [ ] No payment fields or uploads exist on the Apply page.
- [ ] 390px mobile layout: cards stack, no horizontal scroll, chips do not wrap.
- [ ] If the plans request fails, the form still works with Starter only.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` pass.

## 9. Codex prompt

*"Add the 'Choose your plan' step to `/apply` following `kuyog-bohol-apply-plan-step.md`. Build in this order: migration, plans loading in `page.tsx`, `PlanPicker`, renumbering and form wiring, server action validation, received page, admin chip and filter, approval email line, `/owner/welcome` activation card. Read prices, limits and rates from the `plans` table, never hard-code them. No payments on the Apply page. Keep Turnstile, rate limits and the service-role insert as they are. Run lint, typecheck and build, and list anything you could not verify."*
