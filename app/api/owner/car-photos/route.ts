import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload car photos." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload form could not be read." }, { status: 400 });
  }

  const file = form.get("file");
  const carId = form.get("carId");
  if (!(file instanceof File) || typeof carId !== "string" || !carId) {
    return NextResponse.json({ error: "Choose a car and a photo to upload." }, { status: 400 });
  }
  if (!ACCEPTED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE || file.size === 0) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image up to 10 MB." }, { status: 400 });
  }

  const { data: car, error: carError } = await supabase.from("cars").select("id").eq("id", carId).maybeSingle();
  if (carError || !car) return NextResponse.json({ error: "Car not found or you do not own it." }, { status: 404 });

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
    const [full, thumb] = await Promise.all([
      image.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      image.clone().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
    ]);

    const key = crypto.randomUUID();
    const basePath = `${user.id}/${carId}/${key}`;
    const path = `${basePath}.webp`;
    const thumbPath = `${basePath}-thumb.webp`;
    const bucket = supabase.storage.from("car-photos");
    const { error: fullError } = await bucket.upload(path, full, { contentType: "image/webp", cacheControl: "3600" });
    if (fullError) throw fullError;

    const { error: thumbError } = await bucket.upload(thumbPath, thumb, { contentType: "image/webp", cacheControl: "3600" });
    if (thumbError) {
      await bucket.remove([path]);
      throw thumbError;
    }

    const { data: lastPhoto } = await supabase.from("car_photos").select("sort_order").eq("car_id", carId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const sortOrder = (lastPhoto?.sort_order ?? -1) + 1;
    const { error: rowError } = await supabase.from("car_photos").insert({ car_id: carId, path, thumb_path: thumbPath, sort_order: sortOrder });
    if (rowError) {
      await bucket.remove([path, thumbPath]);
      throw rowError;
    }

    return NextResponse.json({ path, thumbPath, sortOrder });
  } catch (error) {
    if (error instanceof Error && error.message.includes("row-level security")) {
      return NextResponse.json({ error: "You do not have permission to upload photos for this car." }, { status: 403 });
    }
    return NextResponse.json({ error: "The image could not be processed or uploaded. Choose a valid JPG, PNG, or WebP image." }, { status: 400 });
  }
}
