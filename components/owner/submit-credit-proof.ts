"use client";

import { connectionError, withConnectionDeadline } from "@/lib/connection/request";
import { runWithAlerts } from "@/lib/alerts/run";
import { toastSuccess } from "@/lib/alerts/toast";
import { createClient } from "@/lib/supabase/client";

export async function submitCreditProof(
  form: HTMLFormElement,
  ownerId: string,
  setError: (message: string) => void,
  setBusy: (busy: boolean) => void,
  refresh?: () => void,
  onPaused?: () => void,
  onUncertain?: () => void,
) {
  const values = new FormData(form);
  const amount = Number(values.get("amount"));
  const reference = String(values.get("reference") ?? "").trim();
  const file = values.get("proof");
  if (!(amount > 0) || !reference || !(file instanceof File) || !file.size) {
    setError("Enter an amount, transfer reference, and proof image.");
    return { ok: false };
  }
  let paused = false;
  const result = await runWithAlerts({
    connection: {
      reference, amount, statusHref: "/owner/credits",
      checkStatus: async () => {
        const { data, error } = await withConnectionDeadline(signal => createClient().from("owner_credit_ledger")
          .select("id").eq("owner_id", ownerId).eq("type", "topup").eq("reference_no", reference)
          .eq("amount", amount).abortSignal(signal).limit(1).maybeSingle(), 15_000);
        return !error && data ? { state: "found", data: true } : { state: "unknown" };
      },
    },
    setPending: setBusy,
    run: async () => {
      const db = createClient();
      const path = `${ownerId}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
      try {
        const upload = await withConnectionDeadline(() => db.storage.from("topup-proofs").upload(path, file, { contentType: file.type }));
        if (upload.error) throw upload.error;
      } catch (error) {
        if (!onPaused || !connectionError(error)) throw error;
        paused = true;
        onPaused();
        return false;
      }
      try {
        const request = await withConnectionDeadline(signal => db.rpc("submit_owner_topup", {
          p_amount: amount, p_reference: reference, p_proof_path: path,
        }).abortSignal(signal));
        if (request.error) {
          if (!connectionError(request.error)) await db.storage.from("topup-proofs").remove([path]);
          throw request.error;
        }
      } catch (error) {
        if (connectionError(error)?.sent) onUncertain?.();
        throw error;
      }
      return true;
    },

  });
  if (result.ok && result.data) {
    refresh?.();
    await toastSuccess("Top-up sent for review");
    return { ok: true };
  }
  return { ok: false, paused };
}
