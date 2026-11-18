import type { Metadata } from "next";
import { ContactForm } from "@/components/contact/ContactForm";
import { ContactHero } from "@/components/contact/ContactHero";
import { ContactInfoCards } from "@/components/contact/ContactInfoCards";
import { PublicFooter } from "@/components/public-footer";
import { isBookingReference } from "@/lib/contact/schema";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const metadata: Metadata = {
  title: "Contact us | Kuyog Bohol",
  description: "Questions about a booking, a car or becoming an owner? Contact Kuyog Bohol, car rental in Bohol.",
  alternates: { canonical: "/contact" },
};

const topics = ["booking", "cars_pricing", "payment", "owner", "other"] as const;
type Topic = (typeof topics)[number];

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string; ref?: string }> }) {
  const params = await searchParams;
  const initialTopic: Topic = topics.includes(params.topic as Topic) ? params.topic as Topic : "other";
  const initialBookingRef = params.ref && isBookingReference(params.ref) ? params.ref : "";
  let initialName = "";
  let initialEmail = "";

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        initialEmail = user.email ?? "";
        const metadataName = typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        initialName = profile?.full_name?.trim() || metadataName.trim();
      }
    } catch {
      // Contact remains available if an optional session/profile lookup fails.
    }
  }

  return <>
    <ContactHero />
    <main className="relative z-10 mx-auto -mt-12 grid w-full max-w-[1440px] gap-7 px-5 pb-16 sm:px-8 lg:-mt-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8 lg:px-[140px]">
      <ContactForm initialName={initialName} initialEmail={initialEmail} initialTopic={initialTopic} initialBookingRef={initialBookingRef} />
      <ContactInfoCards />
    </main>
    <PublicFooter />
  </>;
}
