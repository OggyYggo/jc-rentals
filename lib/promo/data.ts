import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { carPhotoUrl } from "@/lib/car-photo";

export async function canAccessPromoKit() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin") return true;
  if (profile?.role !== "owner") return false;
  const { data: owner } = await supabase.from("owners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
  return !!owner;
}

export const getPublicPromoCar = cache(async (carId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cars")
    .select("id,owner_id,brand,model,year,seats,transmission,car_type,is_active,allows_self_drive,allows_with_driver,short_code,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)")
    .eq("id", carId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;
  const photos = [...(data.car_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return {
    ...data,
    owner: null,
    photos,
    photoUrl: carPhotoUrl(photos[0]?.thumb_path ?? photos[0]?.path),
    rates: data.car_rates ?? [],
  };
});

export async function loadCarForPromo(carId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "admin"].includes(profile.role)) return null;

  const { data: car } = await supabase
    .from("cars")
    .select("id,owner_id,brand,model,year,seats,transmission,car_type,is_active,allows_self_drive,allows_with_driver,short_code,owner:owners(business_name),car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)")
    .eq("id", carId)
    .eq("is_active", true)
    .maybeSingle();
  if (!car) return null;

  if (profile.role === "owner") {
    const { data: owner } = await supabase.from("owners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (!owner || owner.id !== car.owner_id) return null;
  }

  const owner = Array.isArray(car.owner) ? car.owner[0] : car.owner;
  const photos = [...(car.car_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return {
    ...car,
    owner,
    photos,
    photoUrl: carPhotoUrl(photos[0]?.thumb_path ?? photos[0]?.path),
    rates: car.car_rates ?? [],
  };
}

export type PromoCar = NonNullable<Awaited<ReturnType<typeof loadCarForPromo>>>;
