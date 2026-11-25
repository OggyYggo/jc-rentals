import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function documentFormat(path: string, bytes: Buffer) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return { type: "application/pdf", extension };
  if (extension === "png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return { type: "image/png", extension };
  if ((extension === "jpg" || extension === "jpeg") && bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return { type: "image/jpeg", extension };
  if (extension === "webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { type: "image/webp", extension };
  return null;
}

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ customerId: string; kind: string }> }) {
  const { customerId, kind } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(customerId) || (kind !== "license" && kind !== "id" && kind !== "selfie")) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401, headers: privateHeaders });
  const { data: allowed, error: accessError } = await db.rpc("is_admin");
  if (accessError || allowed !== true) return new Response(null, { status: accessError ? 503 : 403, headers: privateHeaders });

  const query = new URL(request.url).searchParams;
  let path: string | null | undefined;
  let revision: string | undefined;
  if (kind === "selfie") {
    const { data: selfie, error } = await db.from("customer_selfies").select("revision").eq("customer_id", customerId).maybeSingle();
    if (error) return new Response(null, { status: 503, headers: privateHeaders });
    if (!selfie || selfie.revision !== query.get("revision")) return new Response(null, { status: 404, headers: privateHeaders });
    revision = selfie.revision;
    path = `${customerId}/${revision}.webp`;
  } else {
    const { data: customer, error } = await db.from("profiles").select("license_path,id_path")
      .eq("id", customerId).eq("role", "customer").maybeSingle();
    if (error) return new Response(null, { status: 503, headers: privateHeaders });
    path = kind === "license" ? customer?.license_path : customer?.id_path;
  }
  if (!path || !path.startsWith(`${customerId}/`) || !/^[a-zA-Z0-9._/-]+$/.test(path)
      || path.split("/").some((segment: string) => segment === "" || segment === "." || segment === "..")) return new Response(null, { status: 404, headers: privateHeaders });
  const admin = createAdminClient();
  if (!admin) return new Response(null, { status: 503, headers: privateHeaders });
  const { data, error: downloadError } = await admin.storage.from(revision ? "customer-selfies" : "customer-docs").download(path);
  if (downloadError || !data) return new Response(null, { status: 404, headers: privateHeaders });
  if (data.size > 10 * 1024 * 1024) return new Response(null, { status: 413, headers: privateHeaders });
  const buffer = await data.arrayBuffer();
  const format = documentFormat(path, Buffer.from(buffer));
  if (!format) return new Response(null, { status: 415, headers: privateHeaders });

  if (format.type === "application/pdf" && query.get("preview") === "1") {
    return new Response(null, { headers: { ...privateHeaders, "Content-Type": format.type } });
  }

  const { error: auditError } = revision
    ? await db.rpc("admin_log_customer_selfie_view", { p_customer: customerId, p_revision: revision })
    : await db.rpc("admin_log_event", {
    p_action: "document.viewed", p_entity_type: "customer", p_entity_id: customerId,
    p_metadata: { document: kind === "license" ? "Driver’s license" : "ID" },
  });
  if (auditError) return new Response(null, { status: 503, headers: privateHeaders });
  if (format.type === "application/pdf") {
    const { data: signed, error } = await admin.storage.from("customer-docs").createSignedUrl(path, 60, {
      download: `${kind}.pdf`,
    });
    if (error || !signed) return new Response(null, { status: 503, headers: privateHeaders });
    return new Response(null, {
      status: 303, headers: { ...privateHeaders, Location: signed.signedUrl, "Referrer-Policy": "no-referrer" },
    });
  }
  const disposition = query.get("download") === "1" ? "attachment" : "inline";
  return new Response(buffer, { headers: {
    ...privateHeaders,
    "Content-Type": format.type,
    "Content-Disposition": `${disposition}; filename="${kind}.${format.extension}"`,
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  } });
}
