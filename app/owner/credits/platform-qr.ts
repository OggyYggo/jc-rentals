import type { getOwnerContext } from "@/lib/owner-context";

export async function loadPlatformQr(
  supabase: Awaited<ReturnType<typeof getOwnerContext>>["supabase"],
  values: Map<string, unknown>,
) {
  const path = String(values.get("platform_qr_path") ?? "");
  return {
    accountName: String(values.get("platform_account_name") ?? ""),
    qrUrl: path ? (await supabase.storage.from("platform-qr").createSignedUrl(path, 300)).data?.signedUrl ?? null : null,
  };
}
