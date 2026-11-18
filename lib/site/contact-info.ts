export const contactInfo = {
  phone: "[09XX XXX XXXX]",
  email: "[support@yourdomain.com]",
  messengerLabel: "[Kuyog Bohol page]",
  messengerUrl: "[https://m.me/yourpage]",
  supportHours: "[24/7 for urgent booking help]",
  replyWithinHours: "[X]",
  location: "Based in Bohol, Philippines.",
};

export function isContactPlaceholder(value: string | null | undefined): value is string {
  return !value || value.trim().startsWith("[");
}
