# Kuyog Bohol — Supabase Auth Email Templates (all in one file)

Six branded emails that match your design (blue header, white card, blue pill button). Paste each HTML file into Supabase.

**Where:** Supabase Dashboard → **Authentication → Emails** (called *Email Templates* in some versions). Pick the template, set the **Subject**, paste the HTML into the message body, and save.

| # | Supabase template | Subject line | File |
|---|---|---|---|
| 1 | Confirm sign up | Confirm your Kuyog Bohol email | `01-confirm-signup.html` |
| 2 | Invite user | You are approved: set up your Kuyog Bohol owner account | `02-invite-owner.html` |
| 3 | Reset password | Reset your Kuyog Bohol password | `03-reset-password.html` |
| 4 | Magic link | Your Kuyog Bohol sign-in link | `04-magic-link.html` |
| 5 | Change email address | Confirm your new Kuyog Bohol email | `05-change-email.html` |
| 6 | Reauthentication | Your Kuyog Bohol confirmation code | `06-reauthentication.html` |

## Before you paste

1. **Logo:** in every file, replace `https://YOUR-DOMAIN/icon-192.png` with the real public URL of your icon (for example `https://kuyogbohol.com/icon-192.png`). It must be a public image, PNG or JPG.
2. **Domain and SMTP:** emails only reach real users after your domain is verified in Resend and Supabase **SMTP Settings** point to Resend (`smtp.resend.com`, port `465`, user `resend`, password = your API key).
3. **URL Configuration:** Authentication → URL Configuration → set your **Site URL** and add your Vercel and `http://localhost:3000/**` URLs to Redirect URLs.

## The links use your own route

Each button points to `/auth/confirm` with a token hash, for example:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
```

Your route handler (`app/auth/confirm/route.ts`) must call `supabase.auth.verifyOtp({ type, token_hash })` and then redirect to `next`. These `type` values are used:

| Email | `type` | `next` |
|---|---|---|
| Confirm sign up | `email` | `/` |
| Invite user (approved owner) | `invite` | `/owner/welcome` |
| Reset password | `recovery` | `/auth/reset-password` |
| Magic link | `magiclink` | `/` |
| Change email | `email_change` | `/` |

Create the page `/auth/reset-password` where the user types a new password and you call `supabase.auth.updateUser({ password })`.

## Variables used

`{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Email }}`, `{{ .NewEmail }}` (change email), `{{ .Token }}` (6-digit code, reauthentication). Do not change the double curly braces. Supabase fills them in.

---

# The templates

Copy the code block of each template, then paste it into the matching Supabase template. Remember to replace `YOUR-DOMAIN` in the logo URL.

## 1. Confirm sign up

**Supabase template:** Confirm sign up  
**Subject:** Confirm your Kuyog Bohol email

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Confirm your email</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF4FF;">

<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EAF4FF;font-size:1px;line-height:1px;">Confirm your email to start booking.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF4FF;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#0A47B1" style="background-color:#0A47B1;border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <!-- Replace YOUR-DOMAIN with your site address (must be a public image URL) -->
                  <img src="https://YOUR-DOMAIN/icon-192.png" width="52" height="52" alt="Kuyog Bohol" style="display:block;border:0;border-radius:12px;">
                </td>
                <td valign="middle">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#CFE3FF;">Explore Bohol Your Way</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:34px 28px 30px 28px;border-left:1px solid #D6E6F7;border-right:1px solid #D6E6F7;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0B63CE;text-transform:uppercase;">Welcome</div>
            <h1 style="margin:10px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:#0F2342;">Confirm your email</h1>
            <p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#51657F;">Thanks for signing up for Kuyog Bohol. Tap the button below to confirm your email address and start booking cars in Bohol.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
              <tr>
                <td align="center" bgcolor="#0B63CE" style="background-color:#0B63CE;border-radius:999px;">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Confirm my email</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">
              Button not working? Copy this link into your browser:<br>
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/" target="_blank" style="color:#0B63CE;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/</a>
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td bgcolor="#EAF4FF" style="background-color:#EAF4FF;border-radius:12px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">This link works once and expires after a short time. If it expires, sign in and ask for a new one.</td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER STRIP -->
        <tr>
          <td bgcolor="#0A3D91" align="center" style="background-color:#0A3D91;padding:16px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol | Car Rental In Bohol</div>
          </td>
        </tr>

        <!-- SMALL PRINT -->
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #D6E6F7;border-top:0;border-radius:0 0 16px 16px;padding:18px 28px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#51657F;">
              This email was sent to {{ .Email }} by Kuyog Bohol.<br>
              If you did not expect it, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
```

## 2. Invite user (approved owner)

**Supabase template:** Invite user  
**Subject:** You are approved: set up your Kuyog Bohol owner account

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Welcome, car owner</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF4FF;">

<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EAF4FF;font-size:1px;line-height:1px;">Your owner application is approved.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF4FF;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#0A47B1" style="background-color:#0A47B1;border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <!-- Replace YOUR-DOMAIN with your site address (must be a public image URL) -->
                  <img src="https://YOUR-DOMAIN/icon-192.png" width="52" height="52" alt="Kuyog Bohol" style="display:block;border:0;border-radius:12px;">
                </td>
                <td valign="middle">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#CFE3FF;">Explore Bohol Your Way</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:34px 28px 30px 28px;border-left:1px solid #D6E6F7;border-right:1px solid #D6E6F7;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0B63CE;text-transform:uppercase;">Application approved</div>
            <h1 style="margin:10px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:#0F2342;">Welcome, car owner</h1>
            <p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#51657F;">Good news! Your application to list your car on Kuyog Bohol has been approved. Tap the button below to set your password and open your owner dashboard.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
              <tr>
                <td align="center" bgcolor="#0B63CE" style="background-color:#0B63CE;border-radius:999px;">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/owner/welcome" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Set up my owner account</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">
              Button not working? Copy this link into your browser:<br>
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/owner/welcome" target="_blank" style="color:#0B63CE;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/owner/welcome</a>
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td bgcolor="#EAF4FF" style="background-color:#EAF4FF;border-radius:12px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;"><b>Next steps:</b> set your password, top up your credits, and we will publish your car after a final check.</td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER STRIP -->
        <tr>
          <td bgcolor="#0A3D91" align="center" style="background-color:#0A3D91;padding:16px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol | Car Rental In Bohol</div>
          </td>
        </tr>

        <!-- SMALL PRINT -->
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #D6E6F7;border-top:0;border-radius:0 0 16px 16px;padding:18px 28px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#51657F;">
              This email was sent to {{ .Email }} by Kuyog Bohol.<br>
              If you did not expect it, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
```

## 3. Reset password

**Supabase template:** Reset password  
**Subject:** Reset your Kuyog Bohol password

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF4FF;">

<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EAF4FF;font-size:1px;line-height:1px;">Choose a new password for your account.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF4FF;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#0A47B1" style="background-color:#0A47B1;border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <!-- Replace YOUR-DOMAIN with your site address (must be a public image URL) -->
                  <img src="https://YOUR-DOMAIN/icon-192.png" width="52" height="52" alt="Kuyog Bohol" style="display:block;border:0;border-radius:12px;">
                </td>
                <td valign="middle">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#CFE3FF;">Explore Bohol Your Way</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:34px 28px 30px 28px;border-left:1px solid #D6E6F7;border-right:1px solid #D6E6F7;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0B63CE;text-transform:uppercase;">Password reset</div>
            <h1 style="margin:10px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:#0F2342;">Reset your password</h1>
            <p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#51657F;">We received a request to reset the password for your Kuyog Bohol account. Tap the button below to choose a new one.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
              <tr>
                <td align="center" bgcolor="#0B63CE" style="background-color:#0B63CE;border-radius:999px;">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Choose a new password</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">
              Button not working? Copy this link into your browser:<br>
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password" target="_blank" style="color:#0B63CE;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password</a>
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td bgcolor="#EAF4FF" style="background-color:#EAF4FF;border-radius:12px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">If you did not ask for this, you can ignore this email. Your password will not change.</td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER STRIP -->
        <tr>
          <td bgcolor="#0A3D91" align="center" style="background-color:#0A3D91;padding:16px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol | Car Rental In Bohol</div>
          </td>
        </tr>

        <!-- SMALL PRINT -->
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #D6E6F7;border-top:0;border-radius:0 0 16px 16px;padding:18px 28px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#51657F;">
              This email was sent to {{ .Email }} by Kuyog Bohol.<br>
              If you did not expect it, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
```

## 4. Magic link

**Supabase template:** Magic link  
**Subject:** Your Kuyog Bohol sign-in link

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your sign-in link</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF4FF;">

<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EAF4FF;font-size:1px;line-height:1px;">Tap to sign in. No password needed.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF4FF;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#0A47B1" style="background-color:#0A47B1;border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <!-- Replace YOUR-DOMAIN with your site address (must be a public image URL) -->
                  <img src="https://YOUR-DOMAIN/icon-192.png" width="52" height="52" alt="Kuyog Bohol" style="display:block;border:0;border-radius:12px;">
                </td>
                <td valign="middle">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#CFE3FF;">Explore Bohol Your Way</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:34px 28px 30px 28px;border-left:1px solid #D6E6F7;border-right:1px solid #D6E6F7;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0B63CE;text-transform:uppercase;">Sign in</div>
            <h1 style="margin:10px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:#0F2342;">Your sign-in link</h1>
            <p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#51657F;">Tap the button below to sign in to Kuyog Bohol. No password needed.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
              <tr>
                <td align="center" bgcolor="#0B63CE" style="background-color:#0B63CE;border-radius:999px;">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Sign in to Kuyog Bohol</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">
              Button not working? Copy this link into your browser:<br>
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/" target="_blank" style="color:#0B63CE;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/</a>
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td bgcolor="#EAF4FF" style="background-color:#EAF4FF;border-radius:12px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">This link works once. Only open it on a device you trust.</td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER STRIP -->
        <tr>
          <td bgcolor="#0A3D91" align="center" style="background-color:#0A3D91;padding:16px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol | Car Rental In Bohol</div>
          </td>
        </tr>

        <!-- SMALL PRINT -->
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #D6E6F7;border-top:0;border-radius:0 0 16px 16px;padding:18px 28px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#51657F;">
              This email was sent to {{ .Email }} by Kuyog Bohol.<br>
              If you did not expect it, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
```

## 5. Change email address

**Supabase template:** Change email address  
**Subject:** Confirm your new Kuyog Bohol email

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Confirm your new email</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF4FF;">

<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EAF4FF;font-size:1px;line-height:1px;">Confirm the change to your new email.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF4FF;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#0A47B1" style="background-color:#0A47B1;border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <!-- Replace YOUR-DOMAIN with your site address (must be a public image URL) -->
                  <img src="https://YOUR-DOMAIN/icon-192.png" width="52" height="52" alt="Kuyog Bohol" style="display:block;border:0;border-radius:12px;">
                </td>
                <td valign="middle">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#CFE3FF;">Explore Bohol Your Way</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:34px 28px 30px 28px;border-left:1px solid #D6E6F7;border-right:1px solid #D6E6F7;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0B63CE;text-transform:uppercase;">Email change</div>
            <h1 style="margin:10px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:#0F2342;">Confirm your new email</h1>
            <p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#51657F;">You asked to change the email on your Kuyog Bohol account from <b>{{ .Email }}</b> to <b>{{ .NewEmail }}</b>. Tap the button below to confirm.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
              <tr>
                <td align="center" bgcolor="#0B63CE" style="background-color:#0B63CE;border-radius:999px;">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">Confirm new email</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">
              Button not working? Copy this link into your browser:<br>
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/" target="_blank" style="color:#0B63CE;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/</a>
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td bgcolor="#EAF4FF" style="background-color:#EAF4FF;border-radius:12px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">If you did not request this change, please reset your password right away.</td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER STRIP -->
        <tr>
          <td bgcolor="#0A3D91" align="center" style="background-color:#0A3D91;padding:16px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol | Car Rental In Bohol</div>
          </td>
        </tr>

        <!-- SMALL PRINT -->
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #D6E6F7;border-top:0;border-radius:0 0 16px 16px;padding:18px 28px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#51657F;">
              This email was sent to {{ .Email }} by Kuyog Bohol.<br>
              If you did not expect it, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
```

## 6. Reauthentication

**Supabase template:** Reauthentication  
**Subject:** Your Kuyog Bohol confirmation code

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Confirm it is you</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF4FF;">

<!-- Inbox preview text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EAF4FF;font-size:1px;line-height:1px;">Your confirmation code is inside.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAF4FF;">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#0A47B1" style="background-color:#0A47B1;border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <!-- Replace YOUR-DOMAIN with your site address (must be a public image URL) -->
                  <img src="https://YOUR-DOMAIN/icon-192.png" width="52" height="52" alt="Kuyog Bohol" style="display:block;border:0;border-radius:12px;">
                </td>
                <td valign="middle">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#CFE3FF;">Explore Bohol Your Way</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:34px 28px 30px 28px;border-left:1px solid #D6E6F7;border-right:1px solid #D6E6F7;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0B63CE;text-transform:uppercase;">Security check</div>
            <h1 style="margin:10px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:#0F2342;">Confirm it is you</h1>
            <p style="margin:0 0 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#51657F;">Enter this code on Kuyog Bohol to finish the action you started.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" bgcolor="#EAF4FF" style="background-color:#EAF4FF;border:1px dashed #0B63CE;border-radius:14px;padding:22px 12px;font-family:Arial,Helvetica,sans-serif;font-size:36px;line-height:40px;font-weight:bold;letter-spacing:10px;color:#0A3D91;">{{ .Token }}</td></tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
              <tr><td bgcolor="#EAF4FF" style="background-color:#EAF4FF;border-radius:12px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#51657F;">Never share this code with anyone. Kuyog Bohol will never ask you for it by phone or chat.</td></tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER STRIP -->
        <tr>
          <td bgcolor="#0A3D91" align="center" style="background-color:#0A3D91;padding:16px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:#FFFFFF;">Kuyog Bohol | Car Rental In Bohol</div>
          </td>
        </tr>

        <!-- SMALL PRINT -->
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #D6E6F7;border-top:0;border-radius:0 0 16px 16px;padding:18px 28px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#51657F;">
              This email was sent to {{ .Email }} by Kuyog Bohol.<br>
              If you did not expect it, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
```

## Notes

- Layout uses tables and inline styles, so it works in Gmail, Outlook and phone mail apps.
- Dark mode is forced to light so colors stay on brand.
- Test each email: sign up with a test address, request a password reset, and so on. Check spam on the first try.
