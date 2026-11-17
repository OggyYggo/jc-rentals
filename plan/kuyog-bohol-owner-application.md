# Kuyog Bohol — Owner Application (Guest Apply, Account on Approval)

**Decision:** a visitor can apply to list their car **without signing up**. You (admin) review the application. **Only after you approve** does Kuyog Bohol create their account and send an invite email.

**Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres, Auth, Storage, RLS), Resend (through Supabase SMTP and your notification route), Vercel.

---

## 1. The flow

```
Visitor clicks "List your car"
        │
        ▼
Public form  /apply   (no login)
        │  server action: validate, spam check, upload files, insert
        ▼
owner_applications  status = pending
        │        └─► confirmation email to the applicant
        │        └─► notification to admin (bell + email + push)
        ▼
Admin reviews in /admin/applications
   ├── Needs changes ─► email with note ─► applicant re-submits (same link)
   ├── Reject ────────► rejection email   (no account is ever created)
   └── Approve
         │  server action (service role):
         │   1. inviteUserByEmail(email)
         │   2. create profile (role = owner) + owner row
         │   3. create the car from the application (status = draft)
         ▼
Applicant gets invite email (Resend) ─► clicks link ─► sets password
        │         (email is now verified)
        ▼
Owner dashboard  /owner   (car is waiting for final publish approval)
```

**Rule that never changes:** nobody can take bookings or appear in the car list before approval, and a car goes live only after you publish it.

---

## 2. Statuses

| Status | Meaning |
|---|---|
| `pending` | Submitted, waiting for admin |
| `needs_changes` | Admin asked for corrections |
| `approved` | Account created and invite sent |
| `rejected` | Declined, no account |
| `withdrawn` | Applicant cancelled (optional) |

---

## 3. Database

### 3.1 Tables

```sql
create type application_status as enum
  ('pending', 'needs_changes', 'approved', 'rejected', 'withdrawn');

create table public.owner_applications (
  id               uuid primary key default gen_random_uuid(),
  status           application_status not null default 'pending',

  -- applicant
  full_name        text not null,
  email            text not null,
  phone            text not null,
  address          text,

  -- car
  car_make         text not null,
  car_model        text not null,
  car_year         int,
  plate_number     text,
  seats            int,
  transmission     text check (transmission in ('manual','automatic')),
  fuel_type        text,
  offers_self_drive boolean not null default true,
  offers_with_driver boolean not null default false,
  daily_rate_self_drive   numeric(10,2),
  daily_rate_with_driver  numeric(10,2),
  pickup_location  text,
  notes            text,

  -- files (paths inside the private bucket)
  car_photo_paths  text[] not null default '{}',
  orcr_path        text,          -- vehicle registration
  license_path     text,
  id_path          text,
  payment_qr_path  text,

  -- review
  admin_note       text,          -- shown to the applicant when needs_changes or rejected
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  user_id          uuid references auth.users(id),  -- filled on approval

  -- edit link for "needs changes" (guest has no login)
  edit_token_hash  text,
  edit_token_expires_at timestamptz,

  submitted_ip     inet,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index on public.owner_applications (status, created_at desc);
create index on public.owner_applications (lower(email));
```

### 3.2 Duplicate protection

Only one open application per email:

```sql
create unique index owner_applications_one_open_per_email
  on public.owner_applications (lower(email))
  where status in ('pending', 'needs_changes');
```

### 3.3 RLS

The public never touches this table directly. All inserts go through a server action that uses the service role key.

```sql
alter table public.owner_applications enable row level security;

-- No policies for anon or authenticated users on purpose.
-- Admins read and update through server actions (service role),
-- or add an admin-only policy:
create policy "admins read applications"
  on public.owner_applications for select
  using ( (select role from public.profiles where id = auth.uid()) = 'admin' );
```

### 3.4 Private storage bucket

Create a bucket named `owner-applications` and make it **private** (not public). The files include IDs and registration papers.

- Path pattern: `{application_id}/{kind}-{random}.jpg` (kinds: `car`, `orcr`, `license`, `id`, `qr`).
- Admins view files with **signed URLs** (60 seconds), generated server-side.
- On approval, copy the car photos and QR to the normal buckets (car photos public, QR private to the owner). Keep the documents (`orcr`, `license`, `id`) in the private bucket.
- Delete files of rejected applications after 30 days (see section 9).

---

## 4. The public form (`/apply`)

### Page content

- Heading: **Apply to list your car**
- Sub text: *Tell us about you and your car. We review every application and email you the result.*
- Section 1 — **About you:** full name, email, phone, address (optional)
- Section 2 — **Your car:** make, model, year, plate number, seats, transmission, fuel type
- Section 3 — **How you rent it:** Self-drive checkbox, With driver checkbox, daily rate for each, pickup location, notes
- Section 4 — **Photos and documents:**
  - Car photos (3 to 8)
  - OR/CR (vehicle registration)
  - Driver's license
  - Valid ID
  - Payment QR code (where customers send deposits)
- Checkbox: *I agree to the Terms and the owner policy.*
- Captcha (Cloudflare Turnstile)
- Button: **Submit application** (use `SubmitButton` with "Submitting…", see the loading indicators spec)

### After submitting

A confirmation screen: *"Thank you. We received your application and sent a confirmation to your email. We will review it and reply soon."*

### Rules

| Field | Rule |
|---|---|
| Email | Valid format, lowercased, no open application for the same email |
| Phone | Philippine mobile format (`09XX XXX XXXX` or `+639…`) |
| Photos | 3 to 8 images, JPG, PNG or WebP, max 5MB each |
| Documents | JPG, PNG or PDF, max 5MB each |
| Plate number | Required, uppercase |
| Rates | Positive numbers, required for each offered mode |

Validate with **zod** on both the client and the server. The server is the one that counts.

---

## 5. The server action

```ts
// app/apply/actions.ts
"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin"; // service role, server only

const schema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  phone: z.string().regex(/^(\+?63|0)9\d{9}$/),
  car_make: z.string().min(2),
  car_model: z.string().min(1),
  plate_number: z.string().min(3).transform((v) => v.toUpperCase()),
  // …the rest of the fields
});

export async function submitApplication(prev: unknown, formData: FormData) {
  // 1. captcha
  const ok = await verifyTurnstile(formData.get("cf-turnstile-response") as string);
  if (!ok) return { error: "Please complete the check and try again." };

  // 2. rate limit by IP (see section 8)
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (await tooManyAttempts(ip)) return { error: "Too many attempts. Please try again later." };

  // 3. validate fields
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the highlighted fields.", fields: parsed.error.flatten().fieldErrors };

  // 4. validate files (count, size, type)
  // 5. insert the row with the service role to get an id
  const admin = createAdminClient();
  const { data: app, error } = await admin
    .from("owner_applications")
    .insert({ ...parsed.data, submitted_ip: ip })
    .select("id")
    .single();

  if (error?.code === "23505") {
    return { error: "We already have an open application for this email." };
  }
  if (error) return { error: "Something went wrong. Please try again." };

  // 6. upload files to the private bucket, then update the row with the paths
  // 7. send confirmation email to the applicant (Resend)
  // 8. notify admin (insert into notifications for each admin)

  return { ok: true };
}
```

If uploads fail after the row is inserted, delete the row so you never keep half applications.

---

## 6. Admin review (`/admin/applications`)

### List

- Tabs: **Pending** (default), Needs changes, Approved, Rejected
- Columns: applicant, car, submitted date, status
- Skeleton rows while loading
- Pending count shown as a badge in the admin sidebar

### Detail page

- Applicant details with phone and email (tap to call or email)
- Car details and requested rates
- Photo gallery
- Documents viewer (signed URLs, opens in a modal, never public)
- Payment QR preview
- Notes box (**admin_note**) shown to the applicant on "needs changes" or "reject"
- Buttons: **Approve**, **Request changes**, **Reject** (each with the button spinner, and all disabled while one runs)

### Checks to do before approving

- The name on the license and ID matches the applicant
- The plate number matches the OR/CR
- The photos show the same car
- The QR code belongs to the applicant (confirm by phone or a small test payment if you want)

---

## 7. Approval, step by step

```ts
// app/admin/applications/actions.ts
"use server";
export async function approveApplication(applicationId: string) {
  const admin = createAdminClient();
  await requireAdmin(); // check the caller is an admin

  const { data: app } = await admin.from("owner_applications").select("*").eq("id", applicationId).single();
  if (!app || app.status !== "pending") throw new Error("Not pending");

  // 1. invite the user (sends the invite email through your SMTP / Resend)
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(app.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/owner/welcome`,
    data: { full_name: app.full_name, role: "owner" },
  });
  if (error) throw error;
  const userId = invited.user.id;

  // 2. profile + owner rows
  await admin.from("profiles").upsert({ id: userId, full_name: app.full_name, phone: app.phone, role: "owner" });
  await admin.from("owners").insert({ user_id: userId, payment_qr_path: app.payment_qr_path, credits: 0 });

  // 3. create the car as a DRAFT from the application
  await admin.from("cars").insert({
    owner_id: userId,
    make: app.car_make, model: app.car_model, /* …map the rest… */
    status: "draft", // you publish it after a final look
  });

  // 4. mark the application
  await admin.from("owner_applications").update({
    status: "approved", user_id: userId,
    reviewed_by: (await currentAdminId()), reviewed_at: new Date().toISOString(),
  }).eq("id", applicationId);
}
```

Notes:

- Run steps 2 to 4 together safely. If one fails, roll back, or make the whole thing a Postgres function (`approve_application(app_id)`) so it is atomic.
- `inviteUserByEmail` uses your **Invite user** email template in Supabase (Authentication → Emails). Use the Kuyog Bohol design with a button **Set up your owner account**. The link should point to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/owner/welcome`, and your `/auth/confirm` route verifies it with `verifyOtp` (type `invite`).
- **Existing email:** if that email already has an account (for example a customer), do not invite. Instead set their role to `owner` and send a normal "You are approved" email.
- **Credits:** new owners start at 0 credits. They must top up before their cars can be booked (this protects your 5% commission).

### What the owner sees after the invite

1. Clicks the invite link, then sets a password on `/owner/welcome`.
2. Sees a short checklist: ✓ Email verified, ✓ Application approved, ☐ Top up credits, ☐ Car under final review.
3. The car appears on the site only when it is **published** and the owner has credits.

---

## 8. Spam and abuse protection

| Risk | Protection |
|---|---|
| Bots filling the form | Cloudflare Turnstile (free) or hCaptcha |
| Same person flooding you | Rate limit: max 3 applications per IP per hour (store counts in a small table or use Upstash Redis) |
| Duplicate applications | Unique index on open applications per email |
| Huge or harmful files | Max 5MB each, check MIME type **and** file extension on the server, max 8 photos, scan size before upload |
| Reading other people's documents | Private bucket, signed URLs only, admin-only access |
| Direct writes to the table | RLS on, no public policies, service-role server action only |
| Fake email addresses | The confirmation email is sent first, and approval happens only after you review |

Never expose the service role key to the browser. Keep it in `SUPABASE_SERVICE_ROLE_KEY` (a Vercel server environment variable, no `NEXT_PUBLIC_`).

---

## 9. Privacy and cleanup

The documents are personal data (IDs, license, registration).

- Show a short notice on the form: *"Your documents are used only to verify your application and are stored privately."*
- Rejected or withdrawn applications: delete the files (and personal fields) after **30 days** with a scheduled job (pg_cron) that removes the storage objects and clears the row.
- Approved owners: keep documents as long as they are an active owner. Delete when they leave.
- Admin views of documents should be logged (who looked at which file, when).

---

## 10. Notifications and emails

| Event | To | Channels |
|---|---|---|
| Application received | Applicant | Email (confirmation) |
| New application | Admin | Bell, email, push |
| Needs changes | Applicant | Email with your note and a secure edit link |
| Rejected | Applicant | Email with a kind, short note |
| Approved | Applicant | Invite email: **Set up your owner account** |
| Owner finished setup | Admin | Bell |
| First car published | Owner | Bell, email |

Add these to your existing notification types (`application_received`, `application_needs_changes`, `application_rejected`, `application_approved`). Applicant emails go to people with no account, so send them directly through Resend, not through the in-app `notifications` table.

### Needs changes (guests have no login)

1. Generate a random token and store only its **hash** and an expiry (7 days) in `edit_token_hash` and `edit_token_expires_at`.
2. Email a link: `/apply/edit?token=…`.
3. That page loads the application (server side, verifying the token hash), shows the admin's note, lets them update fields and files, and flips the status back to `pending`.

---

## 11. Landing page changes

- Rename the owners band button from **List your car** to **Apply to list your car**, linking to `/apply`.
- Navbar link "List your car" also goes to `/apply`.
- On `/apply`, add a short "How it works for owners" row:
  1. Send your application
  2. We review it
  3. Set up your account and start earning
- Add a small line: *"We review every application to keep Kuyog Bohol safe for customers."*

---

## 12. Rollout checklist

1. Resend domain verified (invites and confirmations need it to reach real users).
2. Supabase SMTP set to Resend.
3. Create the `owner_applications` table, enum, indexes and RLS.
4. Create the private `owner-applications` bucket.
5. Build `/apply` with validation, captcha, and the loading states.
6. Build the server action (rate limit, uploads, confirmation email, admin notification).
7. Build `/admin/applications` (list, detail, signed-URL document viewer).
8. Build approve, request changes, and reject actions (approval as one atomic function).
9. Edit the **Invite user** email template in Supabase and test `/auth/confirm` with `type=invite`.
10. Build `/owner/welcome` (set password and the checklist).
11. Add the cleanup job for rejected applications.
12. Update the landing page buttons.

### Test checklist

- [ ] The form submits without logging in.
- [ ] The same email cannot create two open applications.
- [ ] A bot or a fast spammer is blocked.
- [ ] Files over 5MB or of the wrong type are refused.
- [ ] Documents are not reachable by any public URL.
- [ ] Admin sees a notification and can open every document.
- [ ] **Needs changes** lets the applicant fix it through the emailed link, and it returns to `pending`.
- [ ] **Reject** creates no account.
- [ ] **Approve** sends the invite, the link sets a password, and the owner lands on `/owner/welcome`.
- [ ] The owner's car stays hidden until you publish it and they have credits.
- [ ] Approving an email that already has a customer account upgrades that account instead of failing.
