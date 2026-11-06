"use client";

import { useState } from "react";
import { Copy, Download, ExternalLink, Share2 } from "lucide-react";

type Caption = { label: string; text: string };
type PromoAsset = { name: string; size: string; previewUrl: string; downloadUrl: string; output: "PNG" | "PDF" };

export function PromoSharePanel({ assets, carName, link, businessName, captions }: { assets: PromoAsset[]; carName: string; link: string; businessName: string; captions: Caption[] }) {
  const [message, setMessage] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(0);
  const activeAsset = assets[selectedAsset] ?? assets[0];
  const caption = captions[1]?.text ?? captions[0]?.text ?? `${carName} for rent in Bohol. Book online: ${link}`;
  const encodedLink = encodeURIComponent(link);
  const encodedText = encodeURIComponent(caption);
  const socials = [
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}` },
    { name: "Messenger", href: `fb-messenger://share/?link=${encodedLink}` },
    { name: "Viber", href: `viber://forward?text=${encodedText}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${encodedText}` },
  ];

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied`);
    } catch {
      setMessage("Copy was blocked by your browser. Select and copy the text instead.");
    }
  }

  async function share() {
    if (!navigator.share) return copy(caption, "Caption");
    try {
      await navigator.share({ title: carName, text: caption, url: link });
      setMessage("Share sheet opened");
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") setMessage("Could not open the share sheet.");
    }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border border-[#e7ecf3] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#33445b]">Your booking link</h2><p className="mt-1 break-all text-xs text-[#65738a]">{link}</p></div><button onClick={() => copy(link, "Link")} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#dfe5ec] px-3 text-[11px] font-semibold text-[#4567be]"><Copy size={14}/>Copy link</button></div>
      <div className="mt-4 flex flex-wrap gap-2">{socials.map((social) => <a key={social.name} href={social.href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#f5f7fb] px-3 text-[11px] font-semibold text-[#43536a] hover:bg-[#edf2ff]">{social.name}<ExternalLink size={12}/></a>)}<button onClick={share} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#edf2ff] px-3 text-[11px] font-semibold text-[#4567be]"><Share2 size={13}/>More</button></div>
    </section>

    <section className="rounded-xl border border-[#e7ecf3] bg-white p-4 sm:p-5"><div className="mb-4"><h2 className="text-sm font-semibold text-[#33445b]">Promo templates</h2><p className="mt-1 text-[10px] text-[#8793a3]">Choose a size to preview, then download the artwork with its booking QR code.</p></div><div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{assets.map((asset, index) => <button key={asset.name} onClick={() => setSelectedAsset(index)} aria-pressed={selectedAsset === index} className={`rounded-lg border p-3 text-left ${selectedAsset === index ? "border-[#8ea6e6] bg-[#f1f5ff]" : "border-[#e7ecf3] bg-white"}`}><span className="block text-[11px] font-semibold text-[#43536a]">{asset.name}</span><span className="mt-1 block text-[9px] text-[#8793a3]">{asset.size} · {asset.output}</span></button>)}</div>{activeAsset && <><div className="mb-4 max-w-md overflow-hidden rounded-lg border border-[#e7ecf3] bg-[#f5faff]"><img src={activeAsset.previewUrl} alt={`${activeAsset.name} preview for ${carName}`} className="block h-auto w-full"/></div><a download href={activeAsset.downloadUrl} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white"><Download size={15}/>Download {activeAsset.output}</a></>}</section>

    <section className="rounded-xl border border-[#e7ecf3] bg-white p-4 sm:p-5"><h2 className="text-sm font-semibold text-[#33445b]">Ready-to-post captions</h2><div className="mt-4 space-y-3">{captions.map((item) => <article key={item.label} className="rounded-lg border border-[#edf0f4] bg-[#fbfcfe] p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-[11px] font-semibold text-[#43536a]">{item.label}</h3><button onClick={() => copy(item.text, "Caption")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dfe5ec] px-2.5 text-[10px] font-semibold text-[#4567be]"><Copy size={12}/>Copy caption</button></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#65738a]">{item.text}</p></article>)}</div></section>

    <div className="rounded-xl border border-[#dce8f6] bg-[#edf5ff] p-4"><h2 className="text-xs font-semibold text-[#33445b]">Keep bookings protected</h2><p className="mt-1 text-[11px] leading-5 text-[#65738a]">Post the booking link, not your phone number, so customers can check dates and request bookings through Kuyog Bohol.</p><p className="mt-2 text-[10px] text-[#8793a3]">Promo kit for {businessName}. Your phone number and email are never shown.</p></div>
    <p aria-live="polite" className="min-h-4 text-[10px] text-[#31805c]">{message}</p>
  </div>;
}
