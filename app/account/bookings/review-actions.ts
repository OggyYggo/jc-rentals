"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reviewFields } from "@/lib/reviews/model";
import { refreshReviewPages } from "@/lib/reviews/invalidation";

export async function saveTripReview(input: unknown) {
  const parsed = reviewFields.extend({ id: z.uuid(), edit: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "REVIEW_INVALID" };
  const { id, edit, rating, owner_rating, comment, tags } = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc(edit ? "edit_review" : "submit_review", {
    [edit ? "p_review" : "p_booking"]: id, p_rating: rating, p_owner_rating: owner_rating,
    p_comment: comment, p_tags: tags,
  });
  if (error) return { error: error.message.startsWith("REVIEW_") ? error.message : "REVIEW_UNAVAILABLE" };
  refreshReviewPages();
  return { ok: true };
}
