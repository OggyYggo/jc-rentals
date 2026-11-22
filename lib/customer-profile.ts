import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function getCustomerProfile() {
  await connection();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, { data: documents, error: documentError }] = await Promise.all([
    db.from("profiles").select("full_name, phone, verification, verification_rejection_reason, license_declared_classes").eq("id", user.id).maybeSingle(),
    db.from("my_customer_document_presence").select("has_license, has_id").eq("id", user.id).maybeSingle(),
  ]);
  if (error || documentError) throw new Error("We could not load your profile. Please try again later.");

  const fullName = profile?.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "");
  return {
    db, user, fullName, hasLicense: Boolean(documents?.has_license), hasId: Boolean(documents?.has_id),
    verification: profile?.verification ?? "none", phone: profile?.phone ?? "",
    verificationNote: profile?.verification_rejection_reason, declaredClasses: profile?.license_declared_classes ?? [],
  };
}
