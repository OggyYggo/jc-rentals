"use client";

import Image from "next/image";
import { Check, FileCheck2, ImagePlus } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { documentStatusStyle } from "./document-status";

export function MobileDocumentCard({ label, status, file, onChange, note, preview, selfie, disabled, busy }: {
  label: string; status: keyof typeof documentStatusStyle; file: File | null; onChange: (file: File | null) => void;
  note?: string; preview?: string; selfie?: boolean; disabled?: boolean; busy: boolean;
}) {
  const inputId = useId();
  return <Card className={`gap-2 rounded-2xl border border-[#D6E6F7] bg-white p-4 ring-0 ${selfie && status === "Needed" ? "border-dashed" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-heading text-sm font-semibold text-[#0F2342]">
        <FileCheck2 size={17} aria-hidden="true" className="text-[#0A3D91]" />{label}
      </h2>
      <Badge className={`border-0 font-semibold ${documentStatusStyle[status]}`}>
        {status === "Approved" && <Check size={13} aria-hidden="true" />}{status}
      </Badge>
    </div>
    {note && <p className="text-sm leading-5 text-[#5B6F89]">{note}</p>}
    {preview && !file && <a href={preview} target="_blank" rel="noreferrer" className="relative grid h-[84px] w-full place-items-center overflow-hidden rounded-lg border border-[#D6E6F7] bg-[#F3F9FF] focus-visible:outline-2 focus-visible:outline-[#0A47B1]" aria-label="Open uploaded driver’s license preview">
      <Image src={preview} fill unoptimized sizes="300px" alt="" className="object-contain" />
    </a>}
    {file && <p className="break-words text-xs font-medium text-[#0A3D91]">{file.name} · Ready to upload</p>}
    {!disabled && <div>
      <input id={inputId} type="file" aria-label={label} disabled={busy} capture={selfie ? "user" : undefined}
        accept={selfie ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
        onChange={event => onChange(event.target.files?.[0] ?? null)} className="peer sr-only" />
      <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#D6E6F7] px-3 text-sm font-semibold text-[#0A3D91] hover:bg-[#F3F9FF] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0A47B1] peer-disabled:cursor-default peer-disabled:opacity-60">
        <ImagePlus size={16} aria-hidden="true" />
        {selfie ? "Take or upload photo" : status === "Needed" ? "Choose a file" : "Choose a replacement"}
      </label>
    </div>}
  </Card>;
}
