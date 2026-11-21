import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid payment." }, { status: 400 });
  }
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Fingerprinting unavailable." }, { status: 503 });

  const { data: allowed, error: limitError } = await admin.rpc("take_payment_request", {
    p_scope: "fingerprint", p_caller: user.id,
  });
  if (limitError || !allowed) return Response.json({ error: "Try again shortly." }, {
    status: limitError ? 503 : 429, headers: { "Retry-After": "60" },
  });

  // Payment RLS limits this lookup to the customer, their owner and admins.
  const { data: payment, error: lookupError } = await db.from("payments")
    .select("status, proof_path, proof_sha256").eq("id", id).maybeSingle();
  if (lookupError) return Response.json({ error: "Fingerprinting unavailable." }, { status: 503 });
  if (!payment) return Response.json({ error: "Payment unavailable." }, { status: 403 });
  if (payment.proof_sha256 || payment.status !== "pending") return Response.json({ updated: false });

  const { data: proof, error: downloadError } = await admin.storage.from("payment-proofs").download(payment.proof_path);
  if (downloadError || !proof) return Response.json({ error: "Proof image unavailable." }, { status: 503 });
  const sha256 = createHash("sha256").update(Buffer.from(await proof.arrayBuffer())).digest("hex");
  const { data: updated, error } = await admin.rpc("set_payment_proof_hash", { p_payment_id: id, p_sha256: sha256 });
  if (error) return Response.json({ error: "Fingerprinting unavailable." }, { status: 503 });
  return Response.json({ updated });
}
