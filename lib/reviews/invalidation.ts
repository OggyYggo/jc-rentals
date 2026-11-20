import { revalidatePath } from "next/cache";
export function refreshReviewPages() {
  revalidatePath("/cars/[id]", "page");
  revalidatePath("/cars");
  revalidatePath("/");
  revalidatePath("/account/bookings");
  revalidatePath("/admin", "layout");
  revalidatePath("/owner", "layout");
}
