import { publicMetadata } from "@/lib/site/public-metadata";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";

export const metadata = publicMetadata("/privacy", "Privacy Policy",
  "Learn how Kuyog Bohol uses and protects your account, identity, booking, and payment information.");

export default function PrivacyPage() {
  return <>
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 text-[#0F2342] sm:px-8 sm:py-16">
      <Link href="/" className="text-sm font-medium text-[#0B63CE]">Back to Kuyog Bohol</Link>
      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
      {/* Draft for legal review. Confirm document, booking, financial, audit, and backup retention periods before launch. */}
      <div className="mt-8 space-y-7 text-sm leading-6 text-[#51657F]">
        <section><h2 className="font-semibold text-[#0F2342]">Account and booking information</h2><p>We collect your name, email, phone number, booking dates, pickup details, and itinerary information to run your account, arrange rentals, send updates, and respond to support requests.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Identity documents and consent</h2><p>We collect your driver?s license, government ID, and selfie with ID to verify your identity and eligibility for a rental. We record when you accept this policy for an upload. Authorized Kuyog Bohol administrators review these files in private storage.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Sharing with the vehicle owner</h2><p>Your booked vehicle?s owner receives the contact and booking details needed to provide the rental, your verification status where relevant, and payment proof for payments they review. With your upload consent, Kuyog Bohol may share identity documents with that owner when needed to verify the rental. An owner may also ask to see your license at pickup.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Payments and QR codes</h2><p>We store transfer references, payment and refund proofs, and owner payment QR images to show customers how to pay, verify transfers, and resolve payment or refund issues. Pickup QR codes identify a booking during handover. Share your pickup code only with the vehicle owner or their authorized representative.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Service providers</h2><p>We use Supabase for authentication, data, and file storage, Vercel for hosting, Resend for email when configured, and Cloudflare Turnstile for spam prevention. Turnstile verification may process your IP address. When enabled, Sentry receives limited technical error reports.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Retention</h2><p>We may retain contact messages for up to 12 months. We keep identity files while needed to maintain account verification, support active rentals, or resolve disputes. We retain booking, payment, and consent records as needed for accounting, dispute resolution, and applicable obligations. Contact us for the retention period that applies to a particular record.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Access, corrections, and deletion</h2><p>To request access, correct your information, withdraw consent, or ask us to delete your account or documents, email kuyogbohol@gmail.com or use the <Link href="/contact" className="font-medium text-[#0B63CE] underline">contact form</Link>. We may verify your identity and explain whether any records must be kept to complete a rental, resolve a dispute, or meet an obligation. Please keep passwords and copies of identity documents out of your message.</p></section>
      </div>
    </main>
    <PublicFooter />
  </>;
}
