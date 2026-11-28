"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const displayMode = "(display-mode: standalone)";
const mobile = "(max-width: 767px) and (pointer: coarse)";
const threshold = 72;
const modal = 'dialog[open], [aria-modal="true"]';
const blocked = `${modal}, [data-no-pull-to-refresh], iframe, input, textarea, select, [contenteditable="true"]`;

function standalone() {
  return matchMedia(displayMode).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function subscribe(notify: () => void) {
  const mode = matchMedia(displayMode);
  mode.addEventListener("change", notify);
  return () => mode.removeEventListener("change", notify);
}

export function useStandalone() {
  return useSyncExternalStore(subscribe, standalone, () => false);
}

function ignoresGesture(target: Element) {
  if (target.closest(blocked) || document.querySelector(modal)) return true;
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if ((/auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) ||
        (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1)) return true;
  }
  return false;
}

export function PullToRefresh({ refresh, refreshing, disabled }: {
  refresh: () => void; refreshing: boolean; disabled: boolean;
}) {
  const installed = useStandalone();
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    if (!installed || disabled || refreshing) return;
    let start: { x: number; y: number } | undefined;
    let pull = 0;

    function reset() {
      start = undefined;
      pull = 0;
      setDistance(0);
    }
    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1) { reset(); return; }
      if (!matchMedia(mobile).matches || window.scrollY > 0 ||
          !(event.target instanceof Element) || ignoresGesture(event.target)) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    }
    function onMove(event: TouchEvent) {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 0) { reset(); return; }
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = Math.abs(touch.clientX - start.x);
      if (dy < -5 || (dx > 8 && dx > dy)) { reset(); return; }
      if (dy < 8 && pull === 0) return;
      if (event.cancelable) event.preventDefault();
      pull = Math.min(100, Math.max(0, dy) * 0.55);
      setDistance(pull);
    }
    function onEnd() {
      const ready = pull >= threshold;
      reset();
      if (ready && !document.querySelector(modal)) refresh();
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", reset);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [installed, disabled, refreshing, refresh]);

  if (!installed || disabled || (!distance && !refreshing)) return null;
  return <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+.5rem)] z-[60] mx-auto w-fit rounded-full border border-[#D6E6F7] bg-white px-4 py-2 font-body text-sm font-semibold text-[#0A3D91] shadow-sm md:hidden">
    {refreshing ? "Refreshing…" : distance >= threshold ? "Release to refresh" : "Pull to refresh"}
  </div>;
}
