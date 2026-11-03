# JC Rentals

Customer booking portal built with Next.js and Supabase.

## Customer portal setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the values shown in the Supabase project's API settings.
3. Run `supabase/migrations/202611030001_customer_portal.sql`, `supabase/migrations/202611030002_owner_dashboard.sql`, and `supabase/migrations/202611030003_admin_panel.sql` in order in the Supabase SQL Editor. They create customer, owner, and admin data, booking and calendar rules, private document policies, and platform settings. On a database that already has the platform tables, the migrations add the missing fields and policies.
4. In Supabase Authentication settings, enable Email and Google. For Google, add the Supabase callback URL shown in the provider setup to Google Cloud, and add your app's `/auth/callback` URL to Supabase's allowed redirect URLs. For local development this is `http://localhost:3000/auth/callback`.
5. Restart the app after changing environment variables, then visit `/signup`.

Email confirmation redirects to the profile page. Google and existing email sign-ins open My Bookings. Profile uploads accept PDF, JPG, PNG, or WebP files up to 10 MB. They are stored in the private `customer-docs` bucket and protected by per-customer Storage RLS policies; the app does not create public document URLs.

The cancellation function permits customers to cancel only their own pending or confirmed bookings before the rental start date. It checks ownership and status in Postgres rather than trusting the browser.

## Owner dashboard setup

Owner accounts are provisioned by an administrator; customers cannot promote themselves. After creating the account in Supabase Auth, use its user UUID to assign the owner role and create the business row in the SQL Editor:

```sql
update public.profiles
set role = 'owner'
where id = 'AUTH-USER-UUID';

insert into public.owners (profile_id, business_name, commission_rate)
values ('AUTH-USER-UUID', 'Rental business name', 0.05);
```

The owner dashboard is at `/owner`. It supports vehicle details and photos, self-drive and with-driver rates, bookings, a multi-vehicle calendar with database-checked manual date blocks, booking status transitions, payment received records, and gross/commission/net earnings. Car photos use the public `car-photos` bucket; customer license and ID files remain in the separate private bucket.

## Admin panel setup

After running the admin migration, create an administrator account through Supabase Auth, then promote its profile using the auth user UUID in the SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH-USER-UUID';
```

Sign in at `/login`; administrators are sent to `/admin`. The panel manages owner access and commission rates, vehicle availability, customer verification, booking review, monthly per-owner commission reports with CSV download, and default commission and policy text. Customer documents stay in private storage and are opened with short-lived signed links.

## Local development

```bash
npm install
npm run dev
```

The public marketing page can render without Supabase credentials. Sign-in pages show the required setup state until Supabase is configured.
