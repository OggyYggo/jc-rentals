# Kuyog Bohol — Contact Page (Implementation Spec for Codex)

**Route:** `/contact` (the repo already has `app/contact`; replace or extend it, do not duplicate).
**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase, Resend, Cloudflare Turnstile. Deployed on Vercel.
**Design source:** Claude Design canvas boards **Contact: Desktop** (1440 wide) and **Contact: Mobile** (390 wide).
Related specs: `kuyog-bohol-apply-page-implementation.md` (reuse its Turnstile, rate limit and Resend patterns), `kuyog-bohol-loading-indicators.md`, `kuyog-bohol-security-audit-verified.md`.

---

## 1. Page layout

### Desktop (≥1024px)

| Zone | Spec |
|---|---|
| Header | Same sticky white navbar as the rest of the site. **Contact** is the active link (blue `#0B63CE`, 2px underline). Sign up button: blue `#0B63CE`, white text |
| Hero band | Blue gradient band (`#0A3D91` to `#0B63CE`), side padding **140px**. Eyebrow **WE ARE HERE TO HELP** (12px, letter-spacing .12em, `#CFE3FF`), H1 **Contact us** (56px Inter, white), sub text (18px Work Sans, `#EAF4FF`, max 560px): *Questions about a booking, a car or becoming an owner? Send us a message and we will get back to you.* No mountain or vector art |
| Content | Two columns, `grid-template-columns: minmax(0,1fr) 420px`, gap 32px, side padding 140px. The form card overlaps the hero band by about 64px (negative top margin, wrappers must be `position: relative` so they paint above the band) |
| Left | **Form card**: white, radius 22px, padding 36px 40px, 1px border `#D6E6F7`, soft shadow |
| Right | Stack of cards (gap 20px): contact methods, support hours, where we are, FAQ link |
| Footer | Same footer as the landing page. Includes links Cars, How it works, List your car, Contact, Terms, Privacy |

### Mobile (<1024px, design at 390)

- Side padding **20px**. One column, order: hero, form card, contact methods, support hours, where we are, FAQ, footer.
- Hero H1 36px, sub text 16px. Form card padding 24px, radius 22px.
- Fields stack in one column. Name/email/mobile never sit side by side.
- Email address font 15px so long emails do not wrap. Character counter `white-space: nowrap`.
- Send button full width, 52px high.

### Tokens

- Fonts: **Inter** for headings, labels, buttons; **Work Sans** for paragraphs and helper text.
- Colors: primary `#0B63CE`, deep `#0A3D91`, accent/focus ring `#2E9BF0`, text `#0F2342`, secondary text `#51657F`, borders `#D6E6F7`, soft backgrounds `#F3F9FF` / `#EAF4FF`, error `#C62828`, success `#1E8E5A`.
- Radii: cards 22px, inputs 12px, buttons 999px (pills) or 14px as already used on Apply. Match the Apply page controls exactly.
- Input height 48px, label 14px Inter 600, helper 13px Work Sans `#51657F`.

---

## 2. Form

Title: **Send us a message**. Sub text: *Fill in the form and we will reply by email.*

| Field | Type | Required | Rules |
|---|---|---|---|
| Full name | text | yes | 2–80 chars, trim |
| Email address | email | yes | valid email, max 120, lowercase on save |
| Mobile number | tel | no (label shows "(optional)") | PH format: `09XXXXXXXXX` or `+639XXXXXXXXX`; normalize to `+639XXXXXXXXX`. Empty allowed |
| What is this about? | select | yes | Booking help, Cars and pricing, Payment and deposit, Become an owner, Something else. Stored as `booking`, `cars_pricing`, `payment`, `owner`, `other` |
| Booking reference | text | no (optional) | Helper: *Found in My bookings. Add it if your question is about a booking.* Max 40 chars, letters, numbers and dashes only. Show this field **only** when topic = Booking help or Payment and deposit (it may stay visible in the design; hiding is allowed) |
| Your message | textarea | yes | 10–1000 chars. Helper: *Please do not include passwords or card numbers.* Live counter `0 / 1000` (turns red at 1000) |
| Spam protection | Cloudflare Turnstile, managed mode | yes | 66px bordered box, labeled "I am not a robot" in the design. Reuse the existing `TurnstileBox` from the Apply page |
| **Send message** | submit button | | Blue pill, shows spinner and label *Sending…* while pending |

Under the button: *We use your details only to reply to you.* (links to Privacy).

### Behavior

1. **Prefill:** if the visitor is signed in, prefill name and email from their profile/auth user (editable). Never prefill from the URL except `?topic=` (validated against the allowed list) so other pages can link to `/contact?topic=owner`.
2. **Validation:** zod schema shared by client and server. Validate on blur and on submit. Show the error under the field (red text, red border, `aria-invalid`, `aria-describedby`). On submit with errors, focus the first invalid field.
3. **Submit:** use a server action (`app/contact/actions.ts`). While pending, disable the button and fields, show the spinner (see loading indicators spec). Turnstile token is required.
4. **Success state:** replace the form card content with a success panel (green check icon in a soft circle, H2 *Message sent*, text *Thanks, [first name]. We will reply to [email] within [X] hours.*, buttons **Back to home** and **Send another message**). Move focus to the panel heading and announce with `role="status"`.
5. **Error state:** inline banner above the button (red soft background): *We could not send your message. Please try again, or contact us at [support email].* Keep all field values. Reset Turnstile.
6. **Rate limited:** *Too many messages. Please try again in a few minutes.*
7. Never lose typed text on error.

---

## 3. Right column cards

All text in square brackets in the design is a **placeholder the owner must fill**. Put them in one config file so nobody edits JSX: `lib/site/contact-info.ts`.

```ts
export const contactInfo = {
  phone: "[09XX XXX XXXX]",            // used for tel: and sms: links
  email: "[support@yourdomain.com]",
  messengerLabel: "[Kuyog Bohol page]",
  messengerUrl: "[https://m.me/yourpage]",
  supportHours: "[24/7 for urgent booking help]",
  replyWithinHours: "[X]",
  location: "Based in Bohol, Philippines.",
};
```

If a value still starts with `[`, **hide that row** in production instead of showing the placeholder.

| Card | Content | Behavior |
|---|---|---|
| **CALL OR TEXT** | `[09XX XXX XXXX]`, sub *Tap to call or send a text* | `a href="tel:+63…"`; secondary `sms:` link. 54px blue icon tile |
| **EMAIL** | `[support@yourdomain.com]`, sub *We reply by email* | `mailto:` |
| **MESSENGER** | `[Kuyog Bohol page]`, sub *Quick questions, chat with us* | Opens `messengerUrl` in a new tab, `rel="noopener noreferrer"` |
| **Support hours** | *[24/7 for urgent booking help]. We reply to messages within [X] hours.* | Text only |
| **Where we are** | *Based in Bohol, Philippines. Meet-ups and pickups are arranged with your owner.* | Text only. No map, no street address |
| **Check the FAQ first** | *Many questions are already answered there.* | Link to the FAQ section (`/#faq`, or `/faq` if it exists). Hide the card if no FAQ exists yet |

Each contact method card: 20px/22px padding, radius 16px, 1px border `#D6E6F7`, icon tile 54px radius 14px background `#EAF4FF`, whole card is the link, hover background `#F3F9FF`, visible focus ring `#2E9BF0` 3px.

---

## 4. Server logic

`app/contact/actions.ts` (`"use server"`):

1. Parse input with the shared zod schema. Reject invalid with field errors (return `{ ok:false, fieldErrors }`, never throw to the client).
2. Honeypot: hidden field `website` (off-screen, `tabindex=-1`, `autocomplete=off`). If filled, return `ok:true` silently and store nothing.
3. Verify Turnstile (`https://challenges.cloudflare.com/turnstile/v0/siteverify`, secret `TURNSTILE_SECRET_KEY`, send the client IP). Failure: *Please complete the check and try again.*
4. Rate limit by hashed IP: max **5 messages per hour** and **20 per day**, and max 3 per hour per email. Hash IP with a server secret (same method as the owner application flow). Use the admin client and a definer function; generalize `consume_owner_application_rate_limit` or add `consume_contact_rate_limit(p_ip_hash text)`. Grant EXECUTE to `service_role` only, revoke from `public, anon, authenticated`.
5. Insert the row into `contact_messages` using the admin (service role) client.
6. Send two emails through Resend using the existing helper and brand template. Email failure must **not** fail the request, but log it and keep the row (`email_status`).
   - To support: to `[support@yourdomain.com]`, `reply-to` = the visitor's email, subject `[Contact] {topic label} — {name}`, body with all fields and the booking reference. Escape all user text, plain text body is fine.
   - To the visitor: subject *We received your message*, short text: thanks, we reply within [X] hours, a copy of their message. No links other than the site.
7. Return `{ ok:true }`.

Header injection: never put user input in email headers except `reply-to` after zod email validation. Strip newlines from name and subject parts.

---

## 5. Database

New migration `supabase/migrations/202611180002_contact_messages.sql`:

```sql
create type public.contact_topic as enum ('booking','cars_pricing','payment','owner','other');
create type public.contact_status as enum ('new','in_progress','resolved','spam');

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null check (char_length(email) <= 120),
  mobile text check (mobile is null or mobile ~ '^\+639[0-9]{9}$'),
  topic public.contact_topic not null,
  booking_ref text check (booking_ref is null or booking_ref ~ '^[A-Za-z0-9-]{1,40}$'),
  message text not null check (char_length(message) between 10 and 1000),
  ip_hash text,
  status public.contact_status not null default 'new',
  email_status text not null default 'pending',
  admin_note text,
  resolved_at timestamptz
);

alter table public.contact_messages enable row level security;
-- No policies for anon or authenticated. Inserts happen only through the service role in the server action.
revoke all on public.contact_messages from anon, authenticated;
grant select, update (status, admin_note, resolved_at) on public.contact_messages to authenticated;

create policy "Admins read contact messages" on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy "Admins update contact messages" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
```

Rate limit function (adapt from `202611070004_owner_application_spam_controls.sql`), with `set search_path = public`, EXECUTE for `service_role` only.

Retention: add a note that messages older than 12 months can be deleted (optional pg_cron job).

### Admin inbox (small, optional phase 2)

`/admin/messages`: table (date, name, topic, status), filter by status, detail drawer with the message, **Reply** (`mailto:` with subject prefilled), status select (New, In progress, Resolved, Spam), internal note. Use the existing admin layout and `is_admin()` guard. Also send an in-app admin notification on new message through `notify_admins` (service role).

---

## 5b. Page metadata and SEO

- `<title>`: *Contact us | Kuyog Bohol*. Description: *Questions about a booking, a car or becoming an owner? Contact Kuyog Bohol, car rental in Bohol.*
- One `<h1>`. Canonical `/contact`. Include in sitemap.
- Optional JSON-LD `ContactPage` once real contact details are filled in.

---

## 6. Components

```
app/contact/
  page.tsx                 // server component, metadata, reads user for prefill
  actions.ts               // server action (section 4)
  loading.tsx              // skeleton: hero band + form card placeholder
components/contact/
  ContactHero.tsx
  ContactForm.tsx          // client, react-hook-form + zod resolver, useActionState
  ContactSuccess.tsx
  ContactInfoCards.tsx     // reads lib/site/contact-info.ts
  TurnstileBox.tsx         // reuse from apply
lib/contact/
  schema.ts                // zod schema + topic labels + phone normalizer
lib/site/contact-info.ts
```

Use existing shadcn `Input`, `Textarea`, `Select`, `Button`, `Label`. Do not add a new form library if the Apply page already uses one.

---

## 7. Security rules

- All validation repeated on the server; the client is only for convenience.
- Insert only with the service role client in the server action. No public insert policy.
- Turnstile + honeypot + IP-hash rate limit + per-email limit. Never store the raw IP.
- Plain-text emails or fully escaped HTML. No user-controlled links in the confirmation email.
- Do not log message bodies. Do not expose DB errors to the client.
- Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_INBOX_EMAIL` (where support mail goes) to `.env.example`. Never commit real values.
- The message field warns not to enter passwords or card numbers; do not ask for them anywhere.

## 8. Accessibility

- Every field has a visible `<label>` (not placeholder only) and `autocomplete` (`name`, `email`, `tel`).
- Errors linked with `aria-describedby`, announced politely (`aria-live="polite"` region).
- Success and error panels get focus and `role="status"` / `role="alert"`.
- Focus ring `#2E9BF0` on every control, tab order follows visual order, targets at least 44px.
- Contrast: white on `#0B63CE` passes AA; check `#CFE3FF` eyebrow text on the gradient at its lightest point.
- Respect `prefers-reduced-motion` (no animated transitions beyond opacity).

## 9. Navigation changes

- Navbar and footer **Contact** link to `/contact` on every page (landing, cars, apply, etc.).
- The "Become an owner" topic and the For owners page link to `/contact?topic=owner`.
- Booking pages (`/account/bookings/[id]`) get a *Need help?* link to `/contact?topic=booking&ref={booking code}`; prefill `booking_ref` from the validated `ref` param.

---

## 10. Acceptance checklist

- [ ] `/contact` matches the desktop and mobile designs (140px / 20px side margins, form card overlapping the hero band).
- [ ] Sticky white navbar with Contact active, blue Sign up button.
- [ ] Validation works on client and server; first invalid field is focused.
- [ ] Turnstile is required; the action refuses without a valid token.
- [ ] Honeypot silently drops bots.
- [ ] 6th message in an hour from the same IP is refused with the rate-limit message.
- [ ] A valid submission creates one `contact_messages` row, emails support (reply-to = visitor) and the visitor.
- [ ] Resend failure still shows success to the visitor and marks `email_status`.
- [ ] Success panel shows, focus moves to it; form values are kept on error.
- [ ] Placeholder values in `contact-info.ts` are hidden until filled.
- [ ] `anon` and `authenticated` cannot read or insert `contact_messages` directly (test with the Supabase client).
- [ ] Admin can read messages; customers and owners cannot.
- [ ] Loading skeleton exists; button shows spinner while sending.
- [ ] Lighthouse accessibility ≥ 95 on both widths; no horizontal scroll at 390px.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` pass.

## 11. Codex prompt

*"Implement `/contact` following `kuyog-bohol-contact-page-implementation.md`. Reuse the Apply page's Turnstile box, rate-limit approach and Resend helper. Build in this order: migration, `lib/contact/schema.ts`, `lib/site/contact-info.ts`, server action, form and success components, info cards, page and loading state, navigation links. Never print or commit secrets. Run lint, typecheck and build, and list anything you could not verify."*
