import { NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { documentPrivacyPolicyVersion } from "@/lib/policies/privacy";
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
  if (!(file instanceof File) || (kind !== "license" && kind !== "id" && kind !== "selfie")) {
    return NextResponse.json({ error: "Choose a document type and file." }, { status: 400 });
  }
  if ((!IMAGE_TYPES.has(file.type) && file.type !== "application/pdf") || file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Use a PDF, JPG, PNG, or WebP file up to 10 MB." }, { status: 400 });
  }

  if (form.get("privacy_consent") !== documentPrivacyPolicyVersion) {
    return NextResponse.json({ error: "Accept the Privacy Policy before uploading documents." }, { status: 400 });
  }
  const admin = createAdminClient();
  const authorization = await admin?.rpc("authorize_customer_document_upload", {
    p_customer: user.id, p_kind: kind, p_policy: form.get("privacy_consent"),
  });
  if (authorization?.data === false) {
    return NextResponse.json({ error: "You can upload up to 10 documents per hour. Try again later." }, { status: 429 });
  }
  if (authorization?.error || authorization?.data !== true) {
    return NextResponse.json({ error: "Could not authorize your upload. Try again." }, { status: 503 });
  }

  if (kind === "selfie") {
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "Choose a JPG, PNG, or WebP image." }, { status: 400 });
    let body: Buffer;
    try {
      body = await prepareImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json({ error: "The selfie could not be read. Choose a valid image." }, { status: 400 });
    }
    return saveSelfie(supabase, user.id, body);
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
      body = await prepareImage(input);
      contentType = "image/webp";
      extension = "webp";
    }

    const path = `${user.id}/${kind}/${crypto.randomUUID()}.${extension}`;
    const bucket = supabase.storage.from("customer-docs");
    const { error: uploadError } = await bucket.upload(path, body, { contentType, cacheControl: "0" });
    if (uploadError) throw uploadError;

    const column = kind === "license" ? "license_path" : "id_path";
    const update = supabase.from("profiles").update({ [column]: path }).eq("id", user.id);
    const { data: saved, error: profileUpdateError } = await (previousPath == null
      ? update.is(column, null)
      : update.eq(column, previousPath)).select("id").maybeSingle();
    if (profileUpdateError || !saved) {
      await bucket.remove([path]);
      if (profileUpdateError) throw profileUpdateError;
      return NextResponse.json({ error: "This document was updated elsewhere. Refresh and try again." }, { status: 409 });
    }

    if (previousPath && previousPath !== path) await bucket.remove([previousPath]);
    return NextResponse.json({ path });
  } catch {
    return NextResponse.json({ error: "The document could not be processed or uploaded. Use a valid PDF, JPG, PNG, or WebP file." }, { status: 400 });
  }
}

function prepareImage(input: Buffer) {
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}

async function saveSelfie(db: Awaited<ReturnType<typeof createClient>>, userId: string, body: Buffer) {
  const admin = createAdminClient();
  const failed = () => NextResponse.json({ error: "Could not save the selfie. Try again." }, { status: 503 });
  if (!admin) return failed();
  const [{ data: profile }, { data: previous, error }] = await Promise.all([
    db.from("profiles").select("id").eq("id", userId).eq("role", "customer").maybeSingle(),
    db.from("customer_selfies").select("revision").eq("customer_id", userId).maybeSingle(),
  ]);
  if (!profile || error) return failed();

  const revision = crypto.randomUUID();
  const path = `${userId}/${revision}.webp`;
  const bucket = admin.storage.from("customer-selfies");
  const { error: uploadError } = await bucket.upload(path, body, { contentType: "image/webp", cacheControl: "0" });
  if (uploadError) return failed();
  const record = { customer_id: userId, revision, status: "pending" };
  const { data: saved } = previous
    ? await admin.from("customer_selfies").update(record).eq("customer_id", userId).eq("revision", previous.revision).select("revision").maybeSingle()
    : await admin.from("customer_selfies").insert(record).select("revision").maybeSingle();
  if (!saved) {
    await bucket.remove([path]);
    return failed();
  }
  if (previous) await bucket.remove([`${userId}/${previous.revision}.webp`]);
  return NextResponse.json({ status: "pending" });
}
