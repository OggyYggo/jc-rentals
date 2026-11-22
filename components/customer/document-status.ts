export function documentStatus(present: boolean, verification?: string) {
  if (!present) return "Needed";
  if (verification === "rejected") return "Rejected";
  return verification === "approved" ? "Approved" : "Under review";
}

export const documentStatusStyle = {
  Approved: "bg-[#E3F7EA] text-[#12703A]",
  "Under review": "bg-[#EAF4FF] text-[#0A3D91]",
  Needed: "bg-[#FFF2D6] text-[#8A5A00]",
  Rejected: "bg-[#FDE8E8] text-[#A12A2A]",
  Unavailable: "bg-slate-100 text-slate-700",
};
