const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 120 && emailPattern.test(email) ? email : null;
}

export function environmentRecipients() {
  const emails = (process.env.ADMIN_ALERT_EMAIL ?? "").split(",").map(normalizeEmail);
  return [...new Set(emails.filter((email): email is string => email !== null))].slice(0, 5);
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return name?.[0] && domain ? `${name[0]}***@${domain}` : "";
}

export function senderConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM &&
    !/@(?:gmail|googlemail)\.com(?:>|\s|$)/i.test(process.env.EMAIL_FROM) && process.env.NEXT_PUBLIC_SITE_URL);
}
