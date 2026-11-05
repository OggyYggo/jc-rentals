import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload documents." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload form could not be read." }, { status: 400 });
  }

  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "license" && kind !== "id")) {
    return NextResponse.json({ error: "Choose a document type and file." }, { status: 400 });
  }
  if ((!IMAGE_TYPES.has(file.type) && file.type !== "application/pdf") || file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Use a PDF, JPG, PNG, or WebP file up to 10 MB." }, { status: 400 });
  }

  const { data: profile, error: profileReadError } = kind === "license"
    ? await supabase.from("profiles").select("license_path").eq("id", user.id).single()
    : await supabase.from("profiles").select("id_path").eq("id", user.id).single();
  if (profileReadError || !profile) return NextResponse.json({ error: "Your profile could not be found." }, { status: 404 });
  const previousPath = kind === "license"
    ? ("license_path" in profile ? profile.license_path : null)
    : ("id_path" in profile ? profile.id_path : null);

  try {
    const input = Buffer.from(await file.arrayBuffer());
    let body: Buffer;
    let contentType: string;
    let extension: string;

    if (file.type === "application/pdf") {
      if (input.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return NextResponse.json({ error: "The selected file is not a valid PDF." }, { status: 400 });
      }
      body = input;
      contentType = "application/pdf";
      extension = "pdf";
    } else {
      body = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      contentType = "image/webp";
      extension = "webp";
    }

    const path = `${user.id}/${kind}/${crypto.randomUUID()}.${extension}`;
    const bucket = supabase.storage.from("customer-docs");
    const { error: uploadError } = await bucket.upload(path, body, { contentType, cacheControl: "0" });
    if (uploadError) throw uploadError;

    const profileUpdate = kind === "license"
      ? await supabase.from("profiles").update({ license_path: path }).eq("id", user.id)
      : await supabase.from("profiles").update({ id_path: path }).eq("id", user.id);
    const profileUpdateError = profileUpdate.error;
    if (profileUpdateError) {
      await bucket.remove([path]);
      throw profileUpdateError;
    }

    if (previousPath && previousPath !== path) await bucket.remove([previousPath]);
    return NextResponse.json({ path });
  } catch {
    return NextResponse.json({ error: "The document could not be processed or uploaded. Use a valid PDF, JPG, PNG, or WebP file." }, { status: 400 });
  }
}
