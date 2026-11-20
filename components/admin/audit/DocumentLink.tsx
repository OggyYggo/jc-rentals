"use client";

import { useTransition, type ReactNode } from "react";
import { logDocumentView } from "@/lib/audit/actions";
import { toastError } from "@/lib/alerts/toast";

export function DocumentLink({ entity, id, kind, children, disabled }: {
  entity: "customer" | "application";
  id: string;
  kind: "license" | "id" | "registration";
  children: ReactNode;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending || disabled} className="text-blue-800 underline disabled:text-slate-500"
    onClick={() => startTransition(async () => {
      try {
        const result = await logDocumentView(entity, id, kind);
        if ("error" in result) throw new Error(result.error);
        window.location.assign(result.signedUrl);
      } catch (error) {
        await toastError(error);
      }
    })}>{pending ? "Opening…" : children}</button>;
}
