import { z } from "zod";
import { MAX_CAR_YEAR } from "@/lib/apply/constants";

const phone = z.string().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^(\+63|63|0)9\d{9}$/, "Enter a valid mobile number, like 09XX XXX XXXX."));

export const applicationSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name.").max(100),
  phone,
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  address: z.string().trim().max(200).optional(),
  car_make: z.string().trim().min(2, "Enter the car make.").max(50),
  car_model: z.string().trim().min(1, "Enter the car model.").max(50),
  car_year: z.coerce.number().int().min(1990, "Enter a valid year.").max(MAX_CAR_YEAR),
  plate_number: z.string().trim().min(3, "Enter the plate number.").max(12).transform((v) => v.toUpperCase()),
  seats: z.coerce.number().int().min(1).max(20),
  transmission: z.enum(["manual", "automatic"]),
  fuel_type: z.enum(["gasoline", "diesel", "hybrid", "electric"]),
  offers_self_drive: z.boolean(), offers_with_driver: z.boolean(),
  daily_rate_self_drive: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.number().positive("Enter a daily rate.").optional()),
  daily_rate_with_driver: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.number().positive("Enter a daily rate.").optional()),
  pickup_location: z.string().trim().min(3, "Enter the pickup location.").max(200),
  notes: z.string().trim().max(500).optional(), agree: z.literal(true),
}).superRefine((v, ctx) => {
  if (!v.offers_self_drive && !v.offers_with_driver) ctx.addIssue({ code: "custom", path: ["offers_self_drive"], message: "Choose at least one way to rent your car." });
  if (v.offers_self_drive && !v.daily_rate_self_drive) ctx.addIssue({ code: "custom", path: ["daily_rate_self_drive"], message: "Enter a daily rate." });
  if (v.offers_with_driver && !v.daily_rate_with_driver) ctx.addIssue({ code: "custom", path: ["daily_rate_with_driver"], message: "Enter a daily rate." });
});
export type ApplicationInput = z.input<typeof applicationSchema>;
export function checkFile(file: Pick<File, "name" | "type" | "size">, allowed: readonly string[]) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const extensionTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
  if (!allowed.includes(file.type) || extensionTypes[ext ?? ""] !== file.type) return "This file type is not allowed.";
  if (file.size > 5 * 1024 * 1024) return "This file is bigger than 5MB.";
  return null;
}
