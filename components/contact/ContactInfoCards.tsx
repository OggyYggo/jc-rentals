import { Clock3, Mail, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { contactInfo, isContactPlaceholder } from "@/lib/site/contact-info";
import { normalizeContactPhone } from "@/lib/contact/schema";

const cardClass = "group flex min-h-[106px] items-center gap-4 rounded-2xl border border-[#D6E6F7] bg-white p-5 transition-colors hover:bg-[#F3F9FF] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#2E9BF0]";
const iconClass = "grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[14px] bg-[#EAF4FF] text-[#0B63CE]";

export function ContactInfoCards() {
  const phone = isContactPlaceholder(contactInfo.phone) ? null : normalizeContactPhone(contactInfo.phone);
  const email = isContactPlaceholder(contactInfo.email) ? null : contactInfo.email;
  const messengerUrl = isContactPlaceholder(contactInfo.messengerUrl) ? null : contactInfo.messengerUrl;
  const showHours = !isContactPlaceholder(contactInfo.supportHours) || !isContactPlaceholder(contactInfo.replyWithinHours);

  return <aside className="space-y-5 lg:pt-16" aria-label="Other ways to contact us">
    <div className="space-y-3">
      {phone && <div className={cardClass}>
        <span className={iconClass}><Phone size={22} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#51657F]">Call or text</p><a className="mt-1 block break-all text-[15px] font-semibold text-[#0F2342] hover:text-[#0B63CE]" href={`tel:${phone}`}>{contactInfo.phone}</a><a className="mt-1 inline-block text-xs font-medium text-[#0B63CE] underline" href={`sms:${phone}`}>Tap to call or send a text</a></div>
      </div>}
      {email && <a className={cardClass} href={`mailto:${email}`}>
        <span className={iconClass}><Mail size={22} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#51657F]">Email</p><span className="mt-1 block break-all text-[15px] font-semibold text-[#0F2342]">{email}</span><span className="mt-1 block text-xs text-[#51657F]">We reply by email</span></div>
      </a>}
      {messengerUrl && <a className={cardClass} href={messengerUrl} target="_blank" rel="noopener noreferrer">
        <span className={iconClass}><MessageCircle size={22} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#51657F]">Messenger</p><span className="mt-1 block text-[15px] font-semibold text-[#0F2342]">{contactInfo.messengerLabel}</span><span className="mt-1 block text-xs text-[#51657F]">Quick questions, chat with us</span></div>
      </a>}
    </div>

    {showHours && <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5">
      <span className={`${iconClass} mb-4`}><Clock3 size={22} aria-hidden="true" /></span>
      <h2 className="text-sm font-bold text-[#0F2342]">Support hours</h2>
      {!isContactPlaceholder(contactInfo.supportHours) && <p className="mt-2 text-sm leading-6 text-[#51657F]">{contactInfo.supportHours}</p>}
      {!isContactPlaceholder(contactInfo.replyWithinHours) && <p className="mt-1 text-sm leading-6 text-[#51657F]">We reply to messages within {contactInfo.replyWithinHours} hours.</p>}
    </section>}

    <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5">
      <span className={`${iconClass} mb-4`}><MapPin size={22} aria-hidden="true" /></span>
      <h2 className="text-sm font-bold text-[#0F2342]">Where we are</h2>
      <p className="mt-2 text-sm leading-6 text-[#51657F]">{isContactPlaceholder(contactInfo.location) ? "Based in Bohol, Philippines." : contactInfo.location} Meet-ups and pickups are arranged with your owner.</p>
    </section>

    <Link href="/#faq" className={`${cardClass} min-h-0`}>
      <span className={iconClass}><Search size={22} aria-hidden="true" /></span>
      <span><span className="block text-sm font-bold text-[#0F2342]">Check the FAQ first</span><span className="mt-1 block text-xs leading-5 text-[#51657F]">Many questions are already answered there.</span></span>
    </Link>
  </aside>;
}
