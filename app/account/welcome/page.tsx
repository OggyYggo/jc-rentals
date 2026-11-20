import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Welcome | Kuyog Bohol",
};

export default function CustomerWelcomePage() {
  return (
    <section className="rounded-2xl border border-[#e3e8ef] bg-white p-6 sm:p-8">
      <p className="flex items-center gap-2 text-sm font-medium text-[#166534]">
        <CircleCheck aria-hidden="true" size={18} />
        Email confirmed
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#203149]">
        Welcome to Kuyog Bohol
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[#526178]">
        You’re signed in. Add your phone number, driver’s license, and government ID in your
        profile so we can verify your account before you book. You can also browse rentals first.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/account/profile" className="inline-flex min-h-11 items-center rounded-lg bg-[#2457d6] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]">
          Complete my profile
        </Link>
        <Link href="/cars" className="inline-flex min-h-11 items-center rounded-lg border border-[#dfe5ec] px-4 text-sm font-semibold text-[#34445b] hover:bg-[#f7f9fc]">
          Browse rentals
        </Link>
      </div>
    </section>
  );
}
