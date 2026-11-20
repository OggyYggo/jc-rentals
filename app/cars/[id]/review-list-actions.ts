"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicReviewPage } from "@/lib/reviews/public";

const inputSchema = z.object({
  carId: z.uuid(),
  order: z.enum(["newest", "highest", "lowest"]),
  cursor: z.object({ id: z.uuid(), created_at: z.iso.datetime({ offset: true }), rating: z.number().int().min(1).max(5) }).optional(),
});

export async function loadVehicleReviews(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { carId, order, cursor } = parsed.data;
  return publicReviewPage(await createClient(), carId, order, cursor);
}
