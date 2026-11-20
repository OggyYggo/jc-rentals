import { z } from "zod";

export const tagLabels = {
  clean: "Clean", as_described: "As described", smooth_pickup: "Smooth pickup", fair_price: "Fair price",
  friendly_owner: "Friendly owner", on_time: "On time", needs_improvement: "Needs improvement",
} as const;
export const reportReasons = {
  spam: "Spam", offensive: "Offensive", personal_info: "Personal information", fake: "Fake review", other: "Other",
} as const;

export const reviewText = (max: number) => z.string().trim()
  .refine(value => [...value].length <= max && !/https?:\/\/|www\.|</i.test(value));
export const reviewFields = z.object({
  rating: z.number().int().min(1).max(5),
  owner_rating: z.number().int().min(1).max(5).nullable(),
  comment: reviewText(1000),
  tags: z.array(z.enum(Object.keys(tagLabels) as (keyof typeof tagLabels)[]))
    .max(5).refine(tags => new Set(tags).size === tags.length),
});
export type ReviewFields = z.infer<typeof reviewFields>;
export type Review = {
  id: string; car_id: string; rating: number; owner_rating: number | null; tags: (keyof typeof tagLabels)[];
  comment: string | null; owner_reply: string | null; owner_reply_at: string | null; created_at: string;
  reviewer_name: string; trip_month: string;
};
export type MyReview = Pick<Review, "id" | "rating" | "owner_rating" | "tags" | "comment" | "owner_reply" | "created_at">
  & { edited_at: string | null; is_hidden: boolean };

export const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);
export const reviewErrors: Record<string, string> = {
  REVIEW_NOT_ALLOWED: "This review action is no longer available.",
  REVIEW_EXISTS: "You already submitted a review or report for this trip.",
  REVIEW_INVALID: "Check the rating, length and tags. Links and HTML are not allowed.",
  REVIEW_RATE_LIMIT: "You’ve reached the review or report limit. Try again later.",
  REVIEW_UNAVAILABLE: "Could not save your change. Try again.",
};
