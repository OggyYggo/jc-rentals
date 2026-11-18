import { z } from "zod";

export const contactTopics = ["booking", "cars_pricing", "payment", "owner", "other"] as const;
export type ContactTopic = (typeof contactTopics)[number];

export const contactTopicLabels: Record<ContactTopic, string> = {
  booking: "Booking help",
  cars_pricing: "Cars and pricing",
  payment: "Payment and deposit",
  owner: "Become an owner",
  other: "Something else",
};

const fullNameSchema = z.string()
  .transform((value) => value.trim().replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " "))
  .pipe(z.string().min(2, "Enter your full name.").max(80, "Use 80 characters or fewer."));

const emailSchema = z.string().trim().max(120, "Use 120 characters or fewer.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const mobileSchema = z.string().trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => value === "" || /^(?:09\d{9}|\+639\d{9})$/.test(value), "Enter a PH mobile number like 09XX XXX XXXX.")
  .transform((value) => value ? (value.startsWith("09") ? `+63${value.slice(1)}` : value) : null);

const bookingReferenceSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(40, "Use 40 characters or fewer.")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, and dashes only.")
    .optional(),
);

const messageSchema = z.string().trim()
  .min(10, "Write at least 10 characters.")
  .max(1000, "Use 1,000 characters or fewer.");

export const contactSchema = z.object({
  full_name: fullNameSchema,
  email: emailSchema,
  mobile: mobileSchema,
  topic: z.enum(contactTopics, { error: "Choose a topic." }),
  booking_ref: bookingReferenceSchema,
  message: messageSchema,
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactInput;

export function validateContactField(field: ContactField, value: string): string {
  const result = contactSchema.shape[field as keyof typeof contactSchema.shape].safeParse(value);
  return result.success ? "" : result.error.issues[0]?.message ?? "Check this field.";
}

export function normalizeContactPhone(value: string): string | null {
  const normalized = value.replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(normalized)) return `+63${normalized.slice(1)}`;
  if (/^\+639\d{9}$/.test(normalized)) return normalized;
  return null;
}

export function isBookingReference(value: string): boolean {
  return /^[A-Za-z0-9-]{1,40}$/.test(value);
}
