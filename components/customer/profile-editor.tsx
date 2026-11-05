"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, FileCheck2, FileUp, LoaderCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ProfileEditorProps = {
  userId: string;
  fullName: string;
  phone: string;
  hasLicense: boolean;
  hasId: boolean;
  verification: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function ProfileEditor({ userId, fullName, phone, hasLicense, hasId, verification }: ProfileEditorProps) {
  const [name, setName] = useState(fullName);
  const [phoneNumber, setPhoneNumber] = useState(phone);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [licensePresent, setLicensePresent] = useState(hasLicense);
  const [idPresent, setIdPresent] = useState(hasId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      for (const [label, file] of [["Driver's license", licenseFile], ["Government ID", idFile]] as const) {
        if (!file) continue;
        if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(`${label}: use a PDF, JPG, PNG, or WebP file.`);
        if (file.size > MAX_FILE_SIZE) throw new Error(`${label}: the file must be 10 MB or smaller.`);
      }

      for (const [kind, file] of [["license", licenseFile], ["id", idFile]] as const) {
        if (!file) continue;
        const form = new FormData();
        form.append("kind", kind);
        form.append("file", file, file.name);
        const response = await fetch("/api/account/documents", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "The document could not be uploaded.");
      }

      const supabase = createClient();
      const { data: updated, error: profileError } = await supabase.from("profiles").update({
        full_name: name.trim(),
        phone: phoneNumber.trim() || null,
      }).eq("id", userId).select("id").single();
      if (profileError) throw profileError;
      if (!updated) throw new Error("Your profile could not be found. Please sign out and sign in again.");

      if (licenseFile) setLicensePresent(true);
      if (idFile) setIdPresent(true);
      setLicenseFile(null);
      setIdFile(null);
      setMessage("Your profile and documents have been saved securely.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#e3e8ef] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5"><h2 className="text-base font-semibold text-[#26364e]">Personal information</h2><p className="mt-1 text-xs leading-5 text-[#7b8797]">Keep your contact details current for booking updates.</p></div>
        <form onSubmit={saveProfile} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[#526178]">Full name<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#293a52] outline-none focus:border-[#7897e5] focus:ring-3 focus:ring-[#2457d6]/10" /></label>
            <label className="block text-xs font-medium text-[#526178]">Phone number<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} autoComplete="tel" type="tel" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#293a52] outline-none focus:border-[#7897e5] focus:ring-3 focus:ring-[#2457d6]/10" placeholder="+63 9XX XXX XXXX" /></label>
          </div>

            <div className="border-t border-[#edf0f4] pt-5">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf2ff] text-[#2457d6]"><ShieldCheck size={18}/></span><div><h3 className="text-sm font-semibold text-[#34445b]">Identity documents</h3><p className="mt-1 max-w-xl text-xs leading-5 text-[#7b8797]">Upload a clear photo or PDF. Documents are stored privately and are not publicly accessible.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DocumentUpload label="Driver’s license" present={licensePresent} file={licenseFile} onChange={setLicenseFile} />
              <DocumentUpload label="Government ID" present={idPresent} file={idFile} onChange={setIdFile} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8490a0]"><ShieldCheck size={13} className="text-[#5680db]"/> Private storage · PDF, JPG, PNG, or WebP · Up to 10 MB each</div>
            {verification !== "none" && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#edf2ff] px-2.5 py-1 text-[10px] font-medium capitalize text-[#4568b6]"><FileCheck2 size={12}/> Verification {verification}</p>}
          </div>

          {error && <p role="alert" className="rounded-lg border border-[#f1cccc] bg-[#fff6f6] px-3 py-2.5 text-xs text-[#a13a3a]">{error}</p>}
          {message && <p role="status" className="flex items-center gap-2 rounded-lg border border-[#cddcfb] bg-[#f4f7ff] px-3 py-2.5 text-xs text-[#34528f]"><CheckCircle2 size={15}/>{message}</p>}
          <div className="flex justify-end"><button type="submit" disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">{busy && <LoaderCircle size={15} className="animate-spin"/>}Save profile</button></div>
        </form>
      </div>
    </div>
  );
}

function DocumentUpload({ label, present, file, onChange }: { label: string; present: boolean; file: File | null; onChange: (file: File | null) => void }) {
  const inputId = `upload-${label.toLowerCase().replaceAll(" ", "-").replace("’", "")}`;
  return (
    <div className="rounded-xl border border-dashed border-[#d7deea] bg-[#fafbfe] p-3.5">
      <div className="flex items-center gap-2.5"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${file || present ? "bg-[#edf2ff] text-[#2457d6]" : "bg-white text-[#8996a8]"}`}>{file || present ? <FileCheck2 size={16}/> : <FileUp size={16}/>}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#43536a]">{label}</p><p className="mt-0.5 truncate text-[10px] text-[#8793a2]">{file?.name ?? (present ? "Document securely uploaded" : "Not uploaded yet")}</p></div></div>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => onChange(event.target.files?.[0] ?? null)} className="sr-only" />
      <label htmlFor={inputId} className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-lg border border-[#dfe5ec] bg-white px-3 text-[10px] font-semibold text-[#53647a] hover:bg-[#f5f7fb]">{present || file ? "Choose another file" : "Choose a file"}</label>
    </div>
  );
}
