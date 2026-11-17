# Supabase Auth email templates

Paste each HTML file into Supabase Dashboard → Authentication → Emails, then set its subject:

| Template | Subject |
| --- | --- |
| `01-confirm-signup.html` | Confirm your Kuyog Bohol email |
| `02-invite-owner.html` | You are approved: set up your Kuyog Bohol owner account |
| `03-reset-password.html` | Reset your Kuyog Bohol password |
| `04-magic-link.html` | Your Kuyog Bohol sign-in link |
| `05-change-email.html` | Confirm your new Kuyog Bohol email |
| `06-reauthentication.html` | Your Kuyog Bohol confirmation code |

The logo URL uses `{{ .SiteURL }}/icon-192.png`. Set the Supabase Auth Site URL to the public app origin and add production, preview, and local app URLs to Redirect URLs. Configure Supabase SMTP with the verified Resend sending domain before sending to real users.

The links use `/auth/confirm`, which verifies Supabase token hashes and only redirects to allowed local paths. Invite links go to `/owner/welcome`; recovery links go to `/auth/reset-password`.
