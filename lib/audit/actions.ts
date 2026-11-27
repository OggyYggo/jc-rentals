"use server";

import { z } from "zod";
import { getAdminContext } from "@/lib/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordId } from "./filters";
import { entityHistory } from "./queries";
import { entities, type Entity } from "./types";

export async function loadEntityHistory(entity: Entity, id: string) {
  const { supabase } = await getAdminContext();
  if (!z.enum(entities).safeParse(entity).success || !recordId.safeParse(id).success) return null;
  return entityHistory(supabase, entity, id);
}

const documentNames = { license: "Driver’s license", id: "ID", registration: "Vehicle registration" } as const;

export async function logDocumentView(entity: "customer" | "application", id: string, kind: keyof typeof documentNames) {
  const { supabase } = await getAdminContext();
  const error = { error: "Could not open the document. Please try again." };
  if (!z.uuid().safeParse(id).success || !Object.hasOwn(documentNames, kind)) return error;

  const admin = createAdminClient();
  if (!admin) return error;
  let path: string | null | undefined;
  let signedUrl: string | undefined;
  if (entity === "customer" && kind !== "registration") {
    const { data } = await supabase.from("profiles").select("license_path,id_path").eq("id", id).eq("role", "customer").single();
    path = kind === "license" ? data?.license_path : data?.id_path;
    if (path?.startsWith(`${id}/`) && path.split("/").every(segment => segment && segment !== "." && segment !== "..")) {
      const { data: signed } = await admin.storage.from("customer-docs").createSignedUrl(path, 60, { download: true });
      signedUrl = signed?.signedUrl;
    }
  } else if (entity === "application") {
    const { data } = await supabase.from("owner_applications").select("license_path,id_path,orcr_path").eq("id", id).single();
    path = kind === "registration" ? data?.orcr_path : kind === "license" ? data?.license_path : data?.id_path;
    if (path) {
      const { data: signed } = await admin.storage.from("owner-applications").createSignedUrl(path, 60, { download: true });
      signedUrl = signed?.signedUrl;
    }
  }
  if (!signedUrl) return error;

  const { error: logError } = await supabase.rpc("admin_log_event", {
    p_action: "document.viewed", p_entity_type: entity, p_entity_id: id,
    p_metadata: { document: documentNames[kind] },
  });
  return logError ? error : { signedUrl };
}
