"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CarPhotoCarousel({ photos, alt, priority = false }: { photos: string[]; alt: string; priority?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const photo = photos[activeIndex];

  if (!photo) return null;

  function showPrevious() {
    setActiveIndex((index) => (index - 1 + photos.length) % photos.length);
  }

  function showNext() {
    setActiveIndex((index) => (index + 1) % photos.length);
  }

  return <>
    <Image key={photo} src={photo} alt={`${alt}, photo ${activeIndex + 1} of ${photos.length}`} fill unoptimized priority={priority} sizes={priority ? "(max-width: 1024px) 100vw, 65vw" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"} className="object-cover" />
    {photos.length > 1 && <>
      <button type="button" aria-label="Show previous car photo" onClick={showPrevious} className="absolute left-3 top-1/2 z-20 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#0A3D91] shadow-md transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"><ChevronLeft size={19}/></button>
      <button type="button" aria-label="Show next car photo" onClick={showNext} className="absolute right-3 top-1/2 z-20 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#0A3D91] shadow-md transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"><ChevronRight size={19}/></button>
      <span aria-live="polite" className="absolute right-3 top-3 z-20 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">{activeIndex + 1} / {photos.length}</span>
    </>}
  </>;
}
