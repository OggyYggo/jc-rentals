# Kuyog Bohol — Loading Indicators Spec

**Goal:** every time the site is fetching content or processing a request, the user sees a clear sign of it. Nobody should wonder if the screen is frozen.

**Applies to:** the customer site, the owner dashboard, and the admin dashboard.

**Stack:** Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui, Supabase.

---

## 1. The rules

| # | Rule |
|---|---|
| 1 | **Anything that takes longer than ~300ms shows a loading state.** Anything shorter shows nothing (it would only flicker). |
| 2 | **Use the right type for the job** (see section 2). Page loads get skeletons, button actions get a spinner, long jobs get a progress bar. |
| 3 | **Skeletons match the real layout** so the page does not jump when content arrives. |
| 4 | **Disable the control while it is working** so users cannot double-submit (a double booking or a double payment proof upload is the worst case). |
| 5 | **Say what is happening** for anything longer than ~2 seconds ("Uploading proof of payment…"). |
| 6 | **Every loading state ends in either content, an empty state, or an error with a Retry button.** Never an infinite spinner. |
| 7 | **Respect reduced motion** (`prefers-reduced-motion`): replace the animation with a static or fading state. |
| 8 | **Make it accessible:** `aria-busy`, `aria-live="polite"`, and a visually hidden "Loading…" label. |

---

## 2. Which indicator to use where

| Situation | Indicator | Where in Kuyog Bohol |
|---|---|---|
| Moving between pages | **Top progress bar** | Every link click, all three apps |
| A page or section is fetching data | **Skeleton** (`loading.tsx` or `<Suspense>`) | Car list, car page, My bookings, owner bookings, admin tables, earnings |
| A button triggers an action | **Button spinner** + disabled + label change | Search cars, Book now, Submit proof, Approve, Reject, Cancel, Save, Log in, Sign up |
| A file is uploading | **Progress bar with percentage** | Proof of payment, owner QR code, car photos, license and ID |
| A full-screen step that must not be interrupted | **Overlay with spinner and message** | Creating a booking, confirming payment, top-up credits |
| Images are loading | **Blur or colored placeholder** | Hero photo, car photos, trip tiles |
| Small live pieces | **Tiny spinner or pulse** | Notification bell loading, search suggestions |
| Background refresh | **Subtle "Updating…" text** (no layout change) | Realtime booking status, dashboard counters |

---

## 3. Components to build

Create these once in `components/loading/` and reuse everywhere.

```
components/loading/
  Spinner.tsx            // the one spinner used everywhere
  SubmitButton.tsx       // button with built-in loading state
  TopProgressBar.tsx     // route-change bar
  PageSkeletons.tsx      // car grid, booking list, table, detail page
  UploadProgress.tsx     // file upload with %
  LoadingOverlay.tsx     // blocking overlay for critical steps
  ErrorState.tsx         // error with Retry (the other half of loading)
```

### 3.1 Spinner

```tsx
// components/loading/Spinner.tsx
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <Loader2 className={cn("size-5 animate-spin motion-reduce:animate-none", className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
```

Use brand blue `#0B63CE` on light backgrounds and white on blue buttons.

### 3.2 Submit button (the most important one)

Works with Server Actions. It reads the form's pending state, so you do not wire it by hand.

```tsx
// components/loading/SubmitButton.tsx
"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "./Spinner";

export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string; // e.g. "Submitting…"
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending && <Spinner className="mr-2 size-4 text-current" />}
      {pending ? pendingText ?? children : children}
    </Button>
  );
}
```

Usage:

```tsx
<form action={submitProof}>
  <SubmitButton pendingText="Uploading proof…">Submit proof of payment</SubmitButton>
</form>
```

For actions that are not forms (Approve, Reject, Cancel), use `useTransition`:

```tsx
"use client";
const [isPending, startTransition] = useTransition();

<Button
  disabled={isPending}
  onClick={() => startTransition(async () => { await approveBooking(id); })}
>
  {isPending && <Spinner className="mr-2 size-4" />}
  {isPending ? "Approving…" : "Approve"}
</Button>
```

### 3.3 Route progress bar (top of the screen)

Simplest option is the `nextjs-toploader` package. Put it once in the root layout.

```bash
npm i nextjs-toploader
```

```tsx
// app/layout.tsx
import NextTopLoader from "nextjs-toploader";

<body>
  <NextTopLoader color="#0B63CE" height={3} showSpinner={false} shadow="0 0 10px #0B63CE,0 0 5px #0B63CE" />
  {children}
</body>
```

Use the same component in the owner and admin layouts if they are separate root layouts.

### 3.4 Skeletons for page loads

Next.js shows a file named `loading.tsx` automatically while a route's data loads. Add one next to each `page.tsx` that fetches data.

```tsx
// app/(customer)/cars/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] px-5 lg:px-[140px] py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cars…</span>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-[#D6E6F7] p-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="mt-4 h-5 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/3" />
            <Skeleton className="mt-5 h-11 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

For a slow part of a page (not the whole page), wrap it in `Suspense`:

```tsx
<Suspense fallback={<BookingListSkeleton />}>
  <BookingList />
</Suspense>
```

Skeleton color: `#EAF4FF` base with a soft shimmer. Add to `globals.css`:

```css
@keyframes shimmer { to { background-position: -200% 0; } }
.skeleton-shimmer {
  background: linear-gradient(90deg, #EAF4FF 25%, #F6FAFF 50%, #EAF4FF 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
@media (prefers-reduced-motion: reduce) { .skeleton-shimmer { animation: none; } }
```

### 3.5 Upload progress

Supabase Storage uploads through the JS client do not report progress. For files where users wait (proof of payment, ID photos), upload with `XMLHttpRequest` to a signed upload URL, or use `tus` resumable uploads. A simple pattern:

```tsx
// components/loading/UploadProgress.tsx
export function UploadProgress({ name, percent }: { name: string; percent: number }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
         className="rounded-2xl border border-[#D6E6F7] p-4">
      <div className="flex justify-between text-sm">
        <span className="truncate">{name}</span>
        <span className="font-semibold text-[#0B63CE]">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EAF4FF]">
        <div className="h-full rounded-full bg-[#0B63CE] transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

If you do not need a real percentage, compress the image in the browser first (for example to under 1MB) so uploads are quick, and show the button spinner with "Uploading…".

### 3.6 Blocking overlay (use sparingly)

Only for steps where interruption causes harm: creating a booking, confirming payment.

```tsx
// components/loading/LoadingOverlay.tsx
import { Spinner } from "./Spinner";

export function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-white/70 backdrop-blur-sm" role="alertdialog" aria-busy="true" aria-live="assertive">
      <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl">
        <Spinner className="size-6 text-[#0B63CE]" />
        <p className="font-medium text-[#0F2342]">{message}</p>
      </div>
    </div>
  );
}
```

### 3.7 Image placeholders

With `next/image`, use `placeholder="blur"` (static images) or a `blurDataURL` (remote). For car photos from Supabase Storage, store a tiny blur string with each photo or use a plain `#EAF4FF` background behind the image so there is never a blank white box.

```tsx
<div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#EAF4FF]">
  <Image src={car.photo} alt={car.name} fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover" />
</div>
```

### 3.8 Error state (the other half)

```tsx
// components/loading/ErrorState.tsx
"use client";
import { Button } from "@/components/ui/button";

export function ErrorState({ message = "Something went wrong.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="grid place-items-center gap-3 rounded-3xl border border-[#D6E6F7] p-10 text-center">
      <p className="font-semibold text-[#0F2342]">{message}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
```

In Next.js, also add `error.tsx` next to each `loading.tsx` and call `reset()` from the Retry button.

---

## 4. Screen-by-screen checklist

### Customer site

| Screen | Loading state |
|---|---|
| Any navigation | Top progress bar |
| Home, search card | **Search cars** button spinner, "Searching…" |
| Car list (`/cars`) | 6-card skeleton grid (`loading.tsx`) |
| Car page | Skeleton: photo block, title, price, booking card |
| Pick dates, check availability | Small spinner inside the price box, "Checking availability…" |
| Book now | Button spinner, then overlay "Creating your booking…" |
| Pay deposit, upload proof | Upload progress bar, then "Submitting…" |
| My bookings | Skeleton rows (3 to 4) |
| Log in, Sign up | Button spinner: "Logging in…", "Creating account…" |
| Notification bell | Tiny spinner while the list loads, then items or "No notifications yet" |

### Owner dashboard

| Screen | Loading state |
|---|---|
| Dashboard home | Skeleton stat cards plus skeleton list |
| Bookings list | Skeleton rows |
| Approve or Reject booking | Button spinner on the clicked button only, both disabled |
| My cars | Skeleton card grid |
| Add or edit car, photo upload | Upload progress per photo, Save button spinner |
| Upload payment QR | Upload progress, then a preview |
| Credits and earnings | Skeleton stat cards and table |
| Top up credits | Overlay "Confirming top-up…" |

### Admin dashboard

| Screen | Loading state |
|---|---|
| Any table (users, owners, bookings, credits, logs) | Table skeleton: 8 rows with the real column widths |
| Approve or suspend owner | Button spinner, row dimmed while working |
| Verify top-up | Button spinner and overlay if it changes balances |
| Stats and charts | Skeleton blocks the size of the chart |
| Notification delivery log | Skeleton rows, then data |

---

## 5. Timing details

| Case | Behavior |
|---|---|
| Faster than 300ms | Show nothing. A tiny delay before the spinner prevents a flash. |
| 300ms to 2s | Spinner or skeleton only. |
| Over 2s | Add a short message ("Still working…"). |
| Over 15s | Show the error state with **Try again**. |
| Skeleton shown | Keep it visible for at least ~400ms so it does not flicker. |

A simple delayed spinner for client-side fetches:

```tsx
function useDelayedFlag(active: boolean, delay = 300) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [active, delay]);
  return show;
}
```

---

## 6. Design details

- **One look everywhere:** the same spinner (a ring in brand blue `#0B63CE`), the same skeleton color (`#EAF4FF`), the same top bar. Do not mix styles between customer, owner and admin.
- **Text on loading buttons:** keep the width the same. Use `min-w-[...]` or a fixed width so the button does not jump when the label changes.
- **Do not hide the page behind a white screen.** Show the page frame (navbar, headings) immediately and load only the changing part.
- **Mobile:** the top bar and button spinners matter most on slow mobile data in Bohol. Keep skeletons light (no heavy animations).
- **Dark text on busy photos:** if you place a spinner over the hero photo, put it on a small white or navy rounded chip so it stays visible.

---

## 7. Accessibility

- Spinners: `role="status"` and a hidden text label.
- Loading containers: `aria-busy="true"`.
- Messages that change (like "Uploading…" to "Done"): `aria-live="polite"`.
- Blocking overlays: move focus into them and prevent background clicks.
- Honor `prefers-reduced-motion`: no spinning or shimmer, show a static "Loading…" text or a gentle fade.

---

## 8. Rollout plan

1. Add `Spinner`, `SubmitButton`, `ErrorState`, and the shimmer CSS.
2. Add the top progress bar to every root layout.
3. Replace every submit and action button with `SubmitButton` or the `useTransition` pattern. **This removes most double-click problems.**
4. Add `loading.tsx` and `error.tsx` for each data page (customer, owner, admin).
5. Add upload progress to proof of payment, QR code, car photos, license and ID.
6. Add the blocking overlay to booking creation and credit top-up only.
7. Test on a throttled connection: in Chrome DevTools, choose **Network, Slow 4G**, then click through every screen.

### Test checklist

- [ ] Every link click shows the top bar.
- [ ] Every button that calls the server shows a spinner and cannot be clicked twice.
- [ ] Every list and table shows a skeleton, not a blank screen.
- [ ] Skeleton shapes match the final layout (no jumping).
- [ ] Every upload shows progress or a spinner with a message.
- [ ] A failed request shows an error with **Try again**.
- [ ] With "reduce motion" turned on, nothing spins or shimmers.
- [ ] A screen reader announces "Loading" and then the result.
