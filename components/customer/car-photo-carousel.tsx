"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EASE_INOUT, gsap, MOTION, useGSAP } from "@/lib/motion/gsap";

export function CarPhotoCarousel({ photos, alt, priority = false, listing = false, prioritizeCover = false }: { photos: string[]; alt: string; priority?: boolean; listing?: boolean; prioritizeCover?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedIndex, setLoadedIndex] = useState(0);
  const scope = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const photo = photos[activeIndex];
  const previousPhoto = photos[loadedIndex];
  const transitioning = priority && activeIndex !== loadedIndex;
  const sizes = priority ? "(max-width: 1024px) 100vw, 65vw" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

  const { contextSafe } = useGSAP({ scope, dependencies: [activeIndex], revertOnUpdate: true });

  function showLoadedPhoto(element: HTMLImageElement) {
    if (!transitioning || image.current !== element) return;
    const finish = () => setLoadedIndex(activeIndex);
    if (!window.matchMedia(MOTION).matches) {
      finish();
      return;
    }
    contextSafe(() => gsap.to(element, { opacity: 1, duration: 0.25, ease: EASE_INOUT, onComplete: finish }))();
  }

  if (!photo) return null;

  return <>
    <div ref={scope} className="absolute inset-0">
      {transitioning && previousPhoto && <Image src={previousPhoto} alt="" fill unoptimized sizes={sizes} className="object-cover" />}
      <Image
        key={photo}
        ref={image}
        src={photo}
        alt={`${alt}, photo ${activeIndex + 1} of ${photos.length}`}
        fill
        unoptimized
        preload={priority && activeIndex === 0 && loadedIndex === 0}
        fetchPriority={prioritizeCover && activeIndex === 0 ? "high" : undefined}
        loading={prioritizeCover || activeIndex !== 0 || transitioning ? "eager" : undefined}
        sizes={sizes}
        className="object-cover"
        style={transitioning ? { opacity: 0 } : undefined}
        onLoad={priority ? (event) => showLoadedPhoto(event.currentTarget) : undefined}
        onError={priority ? () => setLoadedIndex(activeIndex) : undefined}
      />
    </div>
    {photos.length > 1 && <>
      <button type="button" aria-label="Show previous car photo" onClick={() => setActiveIndex((index) => (index - 1 + photos.length) % photos.length)} className={`absolute left-3 top-1/2 z-20 grid ${listing ? "size-11" : "size-9"} -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#0A3D91] shadow-md transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]`}><ChevronLeft size={19}/></button>
      <button type="button" aria-label="Show next car photo" onClick={() => setActiveIndex((index) => (index + 1) % photos.length)} className={`absolute right-3 top-1/2 z-20 grid ${listing ? "size-11" : "size-9"} -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#0A3D91] shadow-md transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]`}><ChevronRight size={19}/></button>
      <span aria-live="polite" className={`absolute right-3 z-20 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white ${listing ? "pointer-events-none bottom-3" : "top-3"}`}>{activeIndex + 1} / {photos.length}</span>
    </>}
  </>;
}
