import { publicMetadata } from "@/lib/site/public-metadata";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";

export const metadata = publicMetadata("/privacy", "Privacy",
  "Read how Kuyog Bohol handles information submitted through the website and contact form, including how to request a correction.");

export default function PrivacyPage() {
  return <>
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 text-[#0F2342] sm:px-8 sm:py-16">
      <Link href="/" className="text-sm font-medium text-[#0B63CE]">← Kuyog Bohol</Link>
      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Privacy</h1>
      <p className="mt-3 text-sm leading-6 text-[#51657F]">This notice explains how information submitted through the Kuyog Bohol website, including the contact form, is used.</p>
      <div className="mt-8 space-y-7 text-sm leading-6 text-[#51657F]">
        <section><h2 className="font-semibold text-[#0F2342]">Information you provide</h2><p className="mt-2">The contact form collects your name, email address, optional mobile number and booking reference, topic, and message. If you are signed in, your name and email may be prefilled for you to review. We use submitted details to respond to your inquiry and help with the related booking or service.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Service providers and spam prevention</h2><p className="mt-2">Contact messages are stored by our database provider. If email delivery is configured, Resend sends the message to our support inbox and sends you a confirmation. Cloudflare Turnstile checks contact form submissions for spam. The verification request may include your IP address; the contact system stores a keyed hash for rate limiting instead of the raw IP address.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Retention and access</h2><p className="mt-2">Contact messages are available to authorized administrators for support. We may retain them for up to 12 months before deletion. Do not include passwords, payment card numbers, or other sensitive credentials in a message.</p></section>
        <section><h2 className="font-semibold text-[#0F2342]">Questions about your information</h2><p className="mt-2">To ask about information you submitted or request a correction, <Link href="/contact" className="font-medium text-[#0B63CE] underline">contact us</Link>.</p></section>
      </div>
    </main>
    <PublicFooter />
  </>;
}
