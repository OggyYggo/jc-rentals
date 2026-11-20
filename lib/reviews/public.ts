import type { createClient } from "@/lib/supabase/server";
import type { Review } from "./model";

export type ReviewOrder = "newest" | "highest" | "lowest";
type ReviewCursor = Pick<Review, "id" | "created_at" | "rating">;
type Database = Awaited<ReturnType<typeof createClient>>;

export async function publicReviewPage(db: Database, carId: string, order: ReviewOrder, cursor?: ReviewCursor) {
  let query = db.from("public_reviews").select("*").eq("car_id", carId);
  if (cursor) {
    const older = `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
    query = order === "newest" ? query.or(older)
      : query.or(`rating.${order === "highest" ? "lt" : "gt"}.${cursor.rating},and(rating.eq.${cursor.rating},or(${older}))`);
  }
  if (order !== "newest") query = query.order("rating", { ascending: order === "lowest" });
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(11);
  return error ? null : { rows: data.slice(0, 10) as Review[], more: data.length > 10 };
}
