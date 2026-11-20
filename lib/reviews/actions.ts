"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-context";
import { getOwnerContext } from "@/lib/owner-context";
import { refreshReviewPages } from "./invalidation";
import { reviewText } from "./model";

const idSchema = z.uuid();
const reasons = z.enum(["spam", "offensive", "personal_info", "fake", "other"]);
const result = (error: {message: string} | null) => {
  if (error) return { error: error.message.startsWith("REVIEW_") ? error.message : "REVIEW_UNAVAILABLE" };
  refreshReviewPages();
  return { ok: true };
};
export async function reportTripReview(id: string, reason: string, note: string) {
  if (!idSchema.safeParse(id).success || !reasons.safeParse(reason).success || !reviewText(300).safeParse(note).success) {
    return { error: "REVIEW_INVALID" };
  }
  const db = await createClient();
  return result((await db.rpc("report_review", { p_review: id, p_reason: reason, p_note: note })).error);
}

export async function replyToTripReview(id: string, reply: string) {
  const text = reviewText(500).safeParse(reply);
  if (!idSchema.safeParse(id).success || !text.success || !text.data) return { error: "REVIEW_INVALID" };
  const { supabase } = await getOwnerContext();
  return result((await supabase.rpc("reply_to_review", { p_review: id, p_reply: text.data })).error);
}

export async function moderateTripReview(id: string, hide: boolean, reason: string) {
  const text = reviewText(300).safeParse(reason);
  if (!idSchema.safeParse(id).success || typeof hide !== "boolean" || !text.success || (hide && text.data.length < 3)) {
    return { error: "REVIEW_INVALID" };
  }
  const { supabase } = await getAdminContext();
  return result((await supabase.rpc("admin_moderate_review", { p_review: id, p_hide: hide, p_reason: text.data })).error);
}

export async function resolveTripReport(id: string, action: string) {
  if (!idSchema.safeParse(id).success || !z.enum(["dismissed", "actioned"]).safeParse(action).success) return { error: "REVIEW_INVALID" };
  const { supabase } = await getAdminContext();
  return result((await supabase.rpc("admin_resolve_review_report", { p_report: id, p_action: action })).error);
}
