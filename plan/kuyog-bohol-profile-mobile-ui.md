# Kuyog Bohol — Customer Profile: Mobile UI (Instructions for Codex)

Implements two mobile screens from the design canvas, boards **"Profile: Customer profile"** (Profile Home) and **"Profile: Documents and ID"**.

## Hard rule: mobile only

- **Do not change the desktop layout in any way.** Everything new applies below the `md` breakpoint (under 768px) only.
- Use Tailwind responsive classes mobile-first, and hide or show with `md:hidden` / `hidden md:block` or `md:` overrides that restore the **exact current desktop classes**.
- Before editing, note the current desktop look of `/account` and the profile page. After editing, check at 1280px that nothing moved. If a shared component must change, keep its desktop output identical.
- No database changes are needed. Reuse the existing profile and document data and actions.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes, layouts or server actions.

## 0. Look at the code first

Open and report before coding (paths are from the Nov 18 snapshot, so verify):
- `components/customer/profile-editor.tsx` (profile and documents form)
- `app/account/` pages and layout, and how the account navigation is built
- `components/customer/booking-list.tsx` and `app/account/bookings/page.tsx` (for counts used on Profile Home)
- Where documents (driver's license, valid ID, selfie) are stored and their review status values
- Existing `SubmitButton` (`components/loading/SubmitButton.tsx`, if present from the testing-fixes plan)

Use the existing brand tokens: primary `#0A47B1`, dark `#0A3D91`, light blue `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, border `#E3EEF9` / `#D6E6F7`; Inter for headings, Work Sans for body. Use existing shadcn components (`Card`, `Button`, `Badge`, `Progress`, `Input`) instead of new ones.

## 1. Screen A: Profile Home (mobile)

Route: the existing customer account landing page (usually `/account`). On mobile it becomes a profile hub. If no hub exists yet, create `app/account/page.tsx` content for mobile only and keep the desktop view as it is.

Layout, top to bottom, page padding 20px, background `#F3F9FF`:

1. **Header card** (centered): 80px circular avatar with initials (photo if the profile has one), full name (Inter 22 bold), email and "Member since {Mon YYYY}" (muted), a verification chip, and an outline **Edit profile** button (height 44px) that opens screen B's page or the existing edit form.
2. **Get verified card**: label "Get verified", count "{done} of 3", a progress bar, one line of help text. The 3 items are: driver's license, valid ID, selfie with ID. Hide this card when all 3 are approved.
3. **Menu card** (rows 38px icon tile + title + subtitle + chevron; row separators `#EEF4FB`):
   - Personal details: "Name, phone, address"
   - Documents and ID: "Driver's license, valid ID"; shows a "{n} missing" warning chip if any are missing
   - My bookings: shows live counts, for example "1 to pay · 1 upcoming"
   - Booking record: shows a "Good" chip. **Show this row only if the booking-abuse module exists** (`kuyog-bohol-booking-abuse-protection.md`); otherwise leave it out
   - My reviews: "{n} trip to rate". **Show only if the ratings module exists**; otherwise leave it out
   - Notifications: "Email alerts for bookings" (only if a notifications page exists; otherwise leave it out)
4. **Second card**: Help and contact (links to `/contact`), Sign out (uses the existing sign-out action).

Verification chip states: `Not verified` (amber `#FFF2D6` / `#8A5A00`), `Verification in progress` (same amber), `Verified` (green `#E3F7EA` / `#12703A`), `Needs attention` (red `#FDE8E8` / `#A12A2A`). Map them from the existing profile and document statuses; do not invent new statuses in the database.

Every row is a full-width link with a minimum 56px height and a visible focus ring.

## 2. Screen B: Documents and ID (mobile)

Route: the existing documents section or page in the profile editor. On mobile, show it as its own screen reachable from Profile Home, with a back arrow.

Layout:
1. Title "Documents and ID" and the line "Upload clear photos. Only you and the Kuyog Bohol admin can see them."
2. A 4-part progress strip: Upload, Review, Verified, Ready (current step highlighted from document statuses).
3. One card per document, in this order:
   - **Driver's license:** title, status chip, optional expiry, Front and Back image tiles (84px high, signed URL previews if available)
   - **Valid ID:** title, status chip, line "Usually checked within 24 hours."
   - **Selfie with ID:** dashed border card while missing, status chip "Needed", help text "Hold your ID next to your face. Make sure both are readable.", **Take or upload photo** button (`<input type="file" accept="image/*" capture="user">` is fine on mobile)
4. Status chips: `Approved` (green with check), `Under review` (light blue), `Needed` (amber), `Rejected` (red, with the admin's reason if one exists).
5. Primary **Save** button, full width, height 52px, with loading state.
6. After a successful save, show an inline success message ("Saved. This page refreshed on its own.") and call `router.refresh()` so new data shows without a manual reload. This also fixes the test note "profile and documents must refresh after submit" (item C1 in `kuyog-bohol-testing-fixes-plan.md`). If that plan is already applied, reuse its solution instead of adding another.

Privacy: never log or display raw storage paths. Use short-lived signed URLs for previews. Do not put document images in public buckets.

## 3. Behavior and loading

- Use `SubmitButton` (or the existing equivalent) so every button shows a spinner and is disabled while a request is running.
- Upload errors use friendly messages (file too large, wrong type, network problem). Never show raw database or storage text.
- Accepted file types: JPG, PNG, WebP, and PDF only where the current code already allows it. Keep the existing size limit.
- After a document is replaced, its status goes back to `Under review`. Use the existing server action and status values.

## 4. Accessibility and quality

- Touch targets at least 44px. Contrast follows the brand tokens above.
- Labels on all inputs, `aria-live="polite"` on the success and error messages, and `aria-label` on icon-only buttons.
- Works at 360px and 390px width without horizontal scroll.

## 5. Tests

1. At 390px: Profile Home shows the header, verification progress and menu; each row opens the right page.
2. Counts on My bookings match the real bookings list.
3. Upload a selfie: spinner shows, then "Saved", the page refreshes without a manual reload, and the chip changes to "Under review".
4. A rejected document shows its reason and lets the customer upload again.
5. When all 3 documents are approved, the Get verified card is hidden and the chip reads "Verified".
6. At 1280px the account and profile pages look **exactly the same as before** (compare screenshots).
7. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 6. Out of scope

No desktop changes, no database changes, no new document types, no admin-side changes.

## 7. Codex prompt

*"Read `kuyog-bohol-profile-mobile-ui.md`. First report the current account and profile files and how documents and verification statuses are stored. Then build the two mobile-only screens (Profile Home and Documents and ID) with Tailwind classes that apply under the `md` breakpoint only, reusing the existing components and actions. Do not change the desktop layout or the database. Skip menu rows for modules that do not exist yet (booking record, reviews, notifications). Call `router.refresh()` after saving documents. Run lint, typecheck and build, compare desktop screenshots before and after, and list anything you could not verify."*
