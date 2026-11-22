"use client";

import { useId, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, FileCheck2, FileUp, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { documentStatus } from "./document-status";
import { MobileDocumentCard } from "./mobile-document-card";

type ProfileEditorProps = {
  section?: "details" | "documents";
  userId: string;
  fullName: string;
  phone: string;
  hasLicense: boolean;
  hasId: boolean;
  verification: string;
  declaredClasses: string[];
  licensePreview?: string;
  selfieStatus?: string;
  selfieUnavailable?: boolean;
  verificationNote?: string | null;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function ProfileEditor({ section, userId, fullName, phone, hasLicense, hasId, verification, declaredClasses, verificationNote, selfieStatus, selfieUnavailable, licensePreview }: ProfileEditorProps) {
  const editingDocuments = section !== "details";
  const mobileDocuments = section === "documents";
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieKey, setSelfieKey] = useState(0);
  const editingDetails = section !== "documents";
  const [name, setName] = useState(fullName);
  const [phoneNumber, setPhoneNumber] = useState(phone);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const router = useRouter();
  const saving = useRef(false);
  const [refreshing, startTransition] = useTransition();
  const [licenseKey, setLicenseKey] = useState(0);
  const [idKey, setIdKey] = useState(0);
  const [classes, setClasses] = useState<string[]>(declaredClasses);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || refreshing) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    let uploaded = false;
    try {
      const documents = [
        { kind: "license", label: "Driver’s license", file: licenseFile, clear: () => { setLicenseFile(null); setLicenseKey(key => key + 1); } },
        { kind: "id", label: "Valid ID", file: idFile, clear: () => { setIdFile(null); setIdKey(key => key + 1); } },
        { kind: "selfie", label: "Selfie with ID", file: selfieFile, clear: () => { setSelfieFile(null); setSelfieKey(key => key + 1); } },
      ];
      for (const { kind, label, file } of documents) {
        if (!file) continue;
        if (!ACCEPTED_TYPES.includes(file.type) || (kind === "selfie" && file.type === "application/pdf")) {
          throw new Error(`${label}: use ${kind === "selfie" ? "a JPG, PNG, or WebP image" : "a PDF, JPG, PNG, or WebP file"}.`);
        }
        if (file.size > MAX_FILE_SIZE) throw new Error(`${label}: the file must be 10 MB or smaller.`);
      }

      for (const { kind, file, clear } of documents) {
        if (!file) continue;
        const form = new FormData();
        form.append("kind", kind);
        form.append("file", file, file.name);
        const response = await fetch("/api/account/documents", { method: "POST", body: form }).catch(() => null);
        if (!response) throw new Error("Could not connect to upload the document. Try again.");
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "The document could not be uploaded.");
        uploaded = true;
        clear();
      }

      const supabase = createClient();
      const { data: updated, error: profileError } = await supabase.from("profiles").update({
        ...(editingDetails && { full_name: name.trim(), phone: phoneNumber.trim() || null }),
        ...(editingDocuments && { license_declared_classes: classes }),
      }).eq("id", userId).select("id").single();
      if (profileError) throw profileError;
      if (!updated) throw new Error("Your profile could not be found. Please sign out and sign in again.");

      setMessage(mobileDocuments ? "Saved. This page refreshed on its own." : uploaded ? "Your documents were submitted for review." : section === "details" ? "Your personal details were saved." : "Your profile was saved.");
      startTransition(() => router.refresh());
    } catch (saveError) {
      if (uploaded) startTransition(() => router.refresh());
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const licenseClasses = <fieldset className="mt-4 rounded-xl bg-[#f5f8ff] p-4"><legend className="px-1 text-xs font-semibold text-[#34445b]">My license covers</legend><div className="mt-2 flex flex-wrap gap-4">{[["car","Car"],["motorcycle","Motorcycle"]].map(([value,label])=><label key={value} className="flex items-center gap-2 text-xs text-[#526178]"><input type="checkbox" checked={classes.includes(value)} onChange={(event)=>setClasses((current)=>event.target.checked?[...new Set([...current,value])]:current.filter((item)=>item!==value))} className="h-4 w-4 accent-[#2457d6]"/>{label}</label>)}</div><p className="mt-2 text-[11px] leading-5 text-[#7b8797]">We confirm this when we review your license. Upload a clear photo of the front and back. Motorcycles need a license valid for motorcycles. Check the current rules on the <a className="font-semibold text-[#2457d6] underline" href="https://lto.gov.ph/wp-content/uploads/2023/09/14-CC2024-DL-CODES.pdf" target="_blank" rel="noreferrer">Land Transportation Office website</a>.</p></fieldset>;

  if (mobileDocuments) {
    const license = documentStatus(hasLicense, verification);
    const id = documentStatus(hasId, verification);
    const selfie = selfieUnavailable ? "Unavailable" : documentStatus(Boolean(selfieStatus), selfieStatus);
    const statuses = [license, id, selfie];
    const currentStep = statuses.every(status => status === "Approved") ? 3
      : statuses.some(status => status === "Needed" || status === "Rejected" || status === "Unavailable") ? 0
      : statuses.some(status => status === "Approved") ? 2 : 1;
    const savingDocuments = busy || refreshing;

    return <div className="space-y-4 font-body">
      <header>
        <h1 className="font-heading text-[24px] font-bold tracking-tight text-[#0F2342]">Documents and ID</h1>
        <p className="mt-1 text-sm leading-5 text-[#5B6F89]">Upload clear photos. Only you and the Kuyog Bohol admin can see them.</p>
      </header>
      <ol aria-label="Verification steps" className="grid grid-cols-4 gap-1.5 rounded-2xl border border-[#D6E6F7] bg-white px-2.5 py-3">
        {["Upload", "Review", "Verified", "Ready"].map((label, index) => <li key={label} aria-current={index === currentStep ? "step" : undefined}
          className={`border-t-4 py-1.5 text-center text-xs font-semibold ${index <= currentStep ? "border-[#0A47B1] text-[#0A3D91]" : "border-[#E3EEF9] text-[#5B6F89]"} ${index === currentStep ? "rounded-b-lg bg-[#EAF4FF]" : ""}`}>
          {label}
        </li>)}
      </ol>
      <form onSubmit={saveProfile} aria-busy={savingDocuments} className="space-y-3">
        {verification === "rejected" && verificationNote && <p className="whitespace-pre-wrap break-words rounded-xl border border-red-100 bg-[#FDE8E8] p-3 text-sm text-[#A12A2A]">{verificationNote}</p>}
        <MobileDocumentCard key={`license-${licenseKey}`} label="Driver’s license" status={license}
          note="Include both sides in one clear image or PDF." preview={licensePreview}
          file={licenseFile} onChange={setLicenseFile} busy={savingDocuments} />
        <MobileDocumentCard key={`id-${idKey}`} label="Valid ID" status={id}
          note="Usually checked within 24 hours." file={idFile} onChange={setIdFile} busy={savingDocuments} />
        <MobileDocumentCard key={`selfie-${selfieKey}`} label="Selfie with ID" status={selfie}
          note={selfieUnavailable ? "Selfie upload is temporarily unavailable." : "Hold your ID next to your face. Make sure both are readable."}
          file={selfieFile} onChange={setSelfieFile} selfie disabled={selfieUnavailable} busy={savingDocuments} />
        <div className="rounded-2xl border border-[#D6E6F7] bg-white px-3 pb-3">{licenseClasses}</div>
        <div aria-live="polite">
          {error && <p className="rounded-lg bg-[#FDE8E8] p-3 text-sm text-[#A12A2A]">{error}</p>}
          {message && !refreshing && <p className="flex items-center gap-2 rounded-lg bg-[#E3F7EA] p-3 text-sm text-[#12703A]"><CheckCircle2 size={17} aria-hidden="true" />{message}</p>}
        </div>
        <SubmitButton busy={savingDocuments} pendingText="Saving…" className="min-h-[52px] w-full rounded-xl bg-[#0A47B1] text-sm font-semibold text-white hover:bg-[#0A3D91]">Save</SubmitButton>
      </form>
    </div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#e3e8ef] bg-white p-5 shadow-sm sm:p-6">
        {section ? <h1 className="mb-5 text-xl font-bold tracking-tight text-[#0F2342]">Personal details</h1>
          : <div className="mb-5"><h2 className="text-base font-semibold text-[#26364e]">Personal information</h2><p className="mt-1 text-xs leading-5 text-[#7b8797]">Keep your contact details current for booking updates.</p></div>}
        <form onSubmit={saveProfile} className="space-y-5">
          {editingDetails && <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[#526178]">Full name<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#293a52] outline-none focus:border-[#7897e5] focus:ring-3 focus:ring-[#2457d6]/10" /></label>
            <label className="block text-xs font-medium text-[#526178]">Phone number<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} autoComplete="tel" type="tel" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#293a52] outline-none focus:border-[#7897e5] focus:ring-3 focus:ring-[#2457d6]/10" placeholder="+63 9XX XXX XXXX" /></label>
          </div>}

          {editingDocuments && <div className={section ? undefined : "border-t border-[#edf0f4] pt-5"}>
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf2ff] text-[#2457d6]"><ShieldCheck size={18}/></span><div><h3 className="text-sm font-semibold text-[#34445b]">Identity documents</h3><p className="mt-1 max-w-xl text-xs leading-5 text-[#7b8797]">Upload a clear photo or PDF. Documents are stored privately and are not publicly accessible.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DocumentUpload key={`license-${licenseKey}`} label="Driver’s license" present={hasLicense} file={licenseFile} onChange={setLicenseFile} />
              <DocumentUpload key={`id-${idKey}`} label="Government ID" present={hasId} file={idFile} onChange={setIdFile} />
            </div>
            {licenseClasses}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8490a0]"><ShieldCheck size={13} className="text-[#5680db]"/> Private storage · PDF, JPG, PNG, or WebP · Up to 10 MB each</div>
            {verification !== "none" && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#edf2ff] px-2.5 py-1 text-[10px] font-medium capitalize text-[#4568b6]"><FileCheck2 size={12}/> Verification {verification}</p>}
            {verification === "rejected" && verificationNote && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-800">{verificationNote}</p>}
          </div>}

          {error && <p role="alert" className="rounded-lg border border-[#f1cccc] bg-[#fff6f6] px-3 py-2.5 text-xs text-[#a13a3a]">{error}</p>}
          {message && !refreshing && <p role="status" className="flex items-center gap-2 rounded-lg border border-[#cddcfb] bg-[#f4f7ff] px-3 py-2.5 text-xs text-[#34528f]"><CheckCircle2 size={15}/>{message}</p>}
          <div className="flex justify-end"><button type="submit" disabled={busy || refreshing} aria-busy={busy || refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">{(busy || refreshing) && <LoaderCircle size={15} className="animate-spin"/>}{section === "details" ? "Save personal details" : "Save profile"}</button></div>
        </form>
      </div>
    </div>
  );
}

function DocumentUpload({ label, present, file, onChange }: {
  label: string; present: boolean; file: File | null; onChange: (file: File | null) => void;
}) {
  const inputId = useId();
  return (
    <div className="rounded-xl border border-dashed border-[#d7deea] bg-[#fafbfe] p-3.5">
      <div className="flex items-center gap-2.5"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${file || present ? "bg-[#edf2ff] text-[#2457d6]" : "bg-white text-[#8996a8]"}`}>{file || present ? <FileCheck2 size={16}/> : <FileUp size={16}/>}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#43536a]">{label}</p><p className="mt-0.5 truncate text-[10px] text-[#8793a2]">{file?.name ?? (present ? "Document securely uploaded" : "Not uploaded yet")}</p></div></div>
      <input id={inputId} type="file" aria-label={label} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => onChange(event.target.files?.[0] ?? null)} className="sr-only" />
      <label htmlFor={inputId} className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-lg border border-[#dfe5ec] bg-white px-3 text-[10px] font-semibold text-[#53647a] hover:bg-[#f5f7fb]">{present || file ? "Choose another file" : "Choose a file"}</label>
    </div>
  );
}
