export const creditsHref = "/owner/credits";
export const topUpHref = `${creditsHref}/top-up`;
export const qrHref = `${topUpHref}/qr`;

export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1]";
export const screen = "min-w-0 space-y-5 font-body text-[#0F2342] lg:hidden";
export const panelShape = "min-w-0 rounded-2xl border p-4";
export const panel = `${panelShape} border-[#E3EEF9] bg-white`;
export const primary = `flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0A47B1] px-4 py-2 text-center font-semibold text-white hover:bg-[#0A3D91] disabled:opacity-60 ${focus}`;
export const secondary = `flex min-h-11 items-center justify-center rounded-xl border border-[#D6E6F7] bg-white px-4 py-2 text-center text-sm font-semibold text-[#0A47B1] ${focus}`;
export const field = `mt-1 block min-h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-3 py-2 ${focus}`;
export const positive = "bg-[#E3F7EA] text-[#12703A]";
export const warning = "bg-[#FFF2D6] text-[#8A5A00]";
export const danger = "bg-[#FDE8E8] text-[#A12A2A]";

export function chip(selected: boolean) {
  return `min-h-11 rounded-full border px-3 text-sm font-semibold ${focus} ${selected
    ? "border-[#0A47B1] bg-[#EAF4FF] text-[#0A47B1]"
    : "border-[#D6E6F7] bg-white text-[#0F2342]"}`;
}
