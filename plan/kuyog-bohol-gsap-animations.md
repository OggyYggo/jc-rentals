# Kuyog Bohol — GSAP Animations (Implementation Spec for Codex)

**Goal:** make the customer-facing pages feel smooth and alive without slowing them down or hiding content. Motion supports the story (find a car, trust, book), it is never required to read or use the page.

**Scope:** customer pages only: landing `/`, `/cars`, `/cars/[slug]`, `/apply`, `/contact`, `/for-owners`. **Do not** animate `/admin`, `/owner`, `/account` dashboards, forms in progress, or tables.
**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui.
Related: `kuyog-bohol-landing-page-design.md`, `kuyog-bohol-loading-indicators.md`, `kuyog-bohol-contact-page-implementation.md`.

---

## 1. Rules (read first)

1. **Content must be visible without JavaScript.** Never set `opacity: 0` in CSS for server-rendered content. Set the hidden start state from GSAP (`gsap.from`) after hydration, or use `autoAlpha` in `useGSAP`. If JS fails, the page is still complete.
2. **`prefers-reduced-motion: reduce`:** no movement, no parallax, no scroll scrubbing. Use `gsap.matchMedia()`; in the reduce branch show everything instantly (or a 150ms opacity fade at most).
3. **Animate only `transform` and `opacity`.** Never width, height, top, left, margin (causes layout shift and jank). Respect the 140px / 20px side margins.
4. **No layout shift (CLS ≤ 0.05).** Animated elements keep their final box size. Never animate the LCP element (the hero H1 and hero image) with opacity from 0 longer than 300ms; prefer a short slide of 12–16px only.
5. **Short and calm.** Entrances 0.5–0.8s, hovers 0.2–0.3s, easing `power3.out` (entrances) and `power2.inOut` (transitions). No bounce, no elastic, no spin.
6. **Play once.** Scroll reveals fire once (`once: true`), they do not replay on scroll back.
7. **Clean up.** Every animation lives inside `useGSAP` with a `scope` ref so Next.js route changes and React strict mode do not leave ghosts. Kill ScrollTriggers on unmount.
8. **Budget:** GSAP core + ScrollTrigger only, loaded only on pages that use them, about 40 KB gzipped. No other animation library. Check `npm run build` output; the landing page JS must not grow by more than 50 KB gzipped.
9. **Keyboard and screen readers:** animation never moves focus, never hides focus rings, never changes DOM order. Elements stay in the accessibility tree while animating (do not use `display:none` as the start state).

## 2. Setup

```bash
npm i gsap @gsap/react
```

GSAP and all its plugins (including ScrollTrigger) are free to use. Register plugins once in a client-only module.

```ts
// lib/motion/gsap.ts
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };
export const EASE_OUT = "power3.out";
export const EASE_INOUT = "power2.inOut";
```

Shared hook so every section follows the rules above:

```ts
// lib/motion/useReveal.ts
"use client";
import { RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP, EASE_OUT } from "./gsap";

/** Fades and lifts every element with [data-reveal] inside `scope` once when it enters the viewport.
 *  [data-reveal-stagger] on a parent staggers its [data-reveal] children. */
export function useReveal(scope: RefObject<HTMLElement | null>) {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]", scope.current!).forEach((el) => {
        gsap.from(el, {
          autoAlpha: 0, y: 24, duration: 0.7, ease: EASE_OUT,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal-stagger]", scope.current!).forEach((group) => {
        gsap.from(group.querySelectorAll("[data-reveal-item]"), {
          autoAlpha: 0, y: 24, duration: 0.6, ease: EASE_OUT, stagger: 0.08,
          scrollTrigger: { trigger: group, start: "top 85%", once: true },
        });
      });
    });
    return () => mm.revert();
  }, { scope });
}
```

Mark up with data attributes so server components stay server components. Wrap each section in a thin client component (`<Reveal>`) that calls `useReveal`.

```tsx
// components/motion/Reveal.tsx
"use client";
import { useRef, type ReactNode } from "react";
import { useReveal } from "@/lib/motion/useReveal";
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return <div ref={ref} className={className}>{children}</div>;
}
```

## 3. Landing page (`/`)

| Section | Animation | Details |
|---|---|---|
| Navbar (sticky white) | Shadow on scroll | After 8px scroll, fade in a 1px bottom border and soft shadow (`opacity` of a pseudo-element, 0.2s). Background stays solid white. Never hide the navbar on scroll |
| Hero | Intro timeline on load | H1 lines slide up 16px + fade (0.6s, stagger 0.08), sub text, then the trust row (*Local owners, Clear pricing, Secure booking, 24/7 support*) items stagger in. Search card rises 20px last. Total under 1.1s. Text is center aligned, so animate from the center, no side slides |
| Hero search card | Mode toggle | Sliding pill indicator between **Self-drive** and **With driver** (animate `x` and width via transform scaleX/`x`, 0.25s `power2.inOut`). Button hover lifts 2px |
| Book in three steps | Stagger reveal | The 3 step cards stagger in (0.1s). The connecting line between steps draws from left to right using `scaleX` 0 to 1 (transform-origin left) when the section enters. Numbers count-in is not needed |
| Featured cars | Grid reveal + filter | Cards stagger in once. On filter tab change (**All / Self-drive / With driver**) fade out old cards (0.15s), swap, fade in new (0.3s, stagger 0.05) using `gsap.context`; use Flip (`gsap/Flip`) only if the layout reorders, otherwise skip |
| Car card hover | Lift | Card `y: -4`, image `scale: 1.04` inside an `overflow-hidden` rounded wrapper, 0.3s. Only on `(hover: hover)` devices |
| Ride with a local driver | Image + text reveal | Photo mosaic: main photo clips in with `clip-path: inset(0 0 100% 0)` to `inset(0)` (0.9s). Small photos stagger after. Gentle parallax on the main photo: `y` from `-24` to `24` with `scrub: true` (desktop only, min-width 1024px) |
| Sit back. Let locals show you Bohol | Cards stagger | Photo cards reveal in a stagger. Hover: caption slides up 8px |
| Numbers / trust band (if any) | Count up | Numbers count from 0 to value over 1.2s, once, `Intl.NumberFormat`. Reduced motion: show final value |
| List your car CTA band | Reveal | Heading, text and button stagger. Button hover: arrow icon moves 4px right |
| Footer | None | No animation |

Avoid: the hero mountain art (removed from the design), floating shapes, parallax on text, auto-playing carousels.

## 4. Other pages

### Contact (`/contact`)
- Hero band: eyebrow, H1, sub text stagger in on load (0.5s). Form card rises 24px after (the card overlaps the band, keep `position: relative`).
- Right column cards: stagger reveal on scroll (desktop), instant on mobile.
- Field focus: border color + 3px ring `#2E9BF0` transition 0.15s (CSS, not GSAP).
- **Error:** on invalid submit, gently shake the invalid field group once (`x: [-6, 6, -4, 4, 0]`, 0.35s). Reduced motion: no shake, only the red border.
- **Success:** the success panel fades and lifts in (0.4s); the check icon draws its stroke with `strokeDashoffset` (0.6s). Then focus moves to the heading (focus is set in code, never by the animation).
- Send button: while pending show the spinner (CSS), no GSAP.

### Apply (`/apply`)
- Page intro like Contact. Section cards (Your details, Your car, Documents, Terms) reveal on scroll once.
- Upload row: when a file is accepted, a check badge scales in 0.8 → 1 with fade (0.25s). Remove: row collapses with `opacity` only (no height animation; use CSS grid-rows trick if height must collapse).
- Success page (`/apply/received`): check draws, then the three "what happens next" steps stagger in.

### Cars list (`/cars`) and car page (`/cars/[slug]`)
- List: skeleton cards (loading.tsx) are CSS shimmer. Real cards fade in once (0.3s stagger 0.04, max 12 cards animated, the rest appear instantly).
- Car page: gallery thumbnail change cross-fades (0.25s). Sticky booking card: no animation except price change (number tweens 0.4s).
- Do not animate on filter changes made by typing; only on tab and select changes.

### For owners (`/for-owners`)
- Same reveal and stagger pattern as the landing page. Earnings figures count up once.

## 5. Page transitions
Keep default Next.js navigation. Do **not** add route transition libraries. The top progress bar from the loading spec remains the only route feedback.

## 6. Performance and quality gates

- Lighthouse performance on mobile does not drop more than 3 points versus before; LCP stays under 2.5s, CLS ≤ 0.05, INP unchanged.
- `will-change: transform` only during an animation (GSAP sets it for you), never permanently.
- `ScrollTrigger.refresh()` after images load only if layout shifts (`next/image` with width and height avoids this).
- On mobile (<768px) disable parallax and scrubbed effects; keep simple fade-up reveals.
- Maximum 40 animated elements per page load; batch lists with `ScrollTrigger.batch` for long grids.
- Test with 4x CPU throttle in Chrome DevTools: no dropped frames above 20%.
- Test with JavaScript disabled: all content visible.
- Test with OS "Reduce motion" on: nothing moves.

## 7. Files

```
lib/motion/
  gsap.ts            // registers plugins, exports gsap, ScrollTrigger, useGSAP, easings
  useReveal.ts       // [data-reveal] / [data-reveal-stagger] hook
  useCountUp.ts      // number tween with reduced-motion fallback
components/motion/
  Reveal.tsx         // client wrapper for scroll reveals
  HeroIntro.tsx      // landing hero timeline
  CountUp.tsx
  DrawCheck.tsx      // SVG check stroke animation
  ParallaxImage.tsx  // desktop-only parallax wrapper
```

## 8. Acceptance checklist

- [ ] GSAP installed, plugins registered once, used only in client components inside `useGSAP`.
- [ ] Landing hero plays a short intro (under 1.1s), nothing is invisible if JS is off.
- [ ] Sections reveal once on scroll; they do not replay.
- [ ] Sticky navbar stays solid white and gains a shadow after scroll.
- [ ] Mode toggle indicator slides smoothly.
- [ ] Car card hover lift works on desktop only.
- [ ] Contact and Apply success checks draw in; invalid fields shake once.
- [ ] `prefers-reduced-motion` turns off all movement and parallax.
- [ ] Only transform and opacity are animated; no layout shift.
- [ ] Admin, owner and account dashboards have no animations.
- [ ] Bundle growth under 50 KB gzipped on the landing page.
- [ ] Lighthouse mobile performance not worse by more than 3 points.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` pass.

## 9. Codex prompt

*"Add GSAP animations following `kuyog-bohol-gsap-animations.md`. Install `gsap` and `@gsap/react`. Build in this order: `lib/motion/*`, `Reveal`, landing hero intro, landing section reveals, hover effects, Contact and Apply effects, then the parallax image on the driver section. Keep server components as they are and wrap only the parts that animate. Respect reduced motion everywhere. Never hide content in CSS. Run lint, typecheck and build, then report bundle size changes and anything you could not verify."*
