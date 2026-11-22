"use client";

import { DrawCheck } from "@/components/motion/DrawCheck";
import { EASE_OUT, gsap, MOTION, useGSAP } from "@/lib/motion/gsap";
import { useFieldShake } from "@/lib/motion/useFieldShake";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import Link from "next/link";
import { submitContactMessage } from "@/app/contact/actions";
import { contactSchema, contactTopics, contactTopicLabels, validateContactField, type ContactField, type ContactTopic } from "@/lib/contact/schema";
import { initialContactActionState } from "@/lib/contact/types";
import { contactInfo, isContactPlaceholder } from "@/lib/site/contact-info";
import { Spinner } from "@/components/loading/Spinner";
import { TurnstileBox, type TurnstileBoxHandle } from "@/components/turnstile/TurnstileBox";

const fieldOrder: ContactField[] = ["full_name", "email", "mobile", "topic", "booking_ref", "message"];
const inputClass = "motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150 mt-2 h-12 w-full rounded-xl border border-[#D6E6F7] bg-white px-4 text-sm text-[#0F2342] outline-none placeholder:text-[#8DA0B8] focus-visible:border-[#0B63CE] focus-visible:ring-[3px] focus-visible:ring-[#2E9BF0]/40 focus-visible:ring-offset-2 disabled:opacity-60";
const areaClass = `${inputClass} h-36 resize-y py-3 leading-6`;

type ContactFormProps = {
  initialName: string;
  initialEmail: string;
  initialTopic: ContactTopic;
  initialBookingRef: string;
};

type ContactFormValues = { full_name: string; email: string; mobile: string; booking_ref: string; message: string };

export function ContactForm({ initialName, initialEmail, initialTopic, initialBookingRef }: ContactFormProps) {
  const [state, formAction, pending] = useActionState(submitContactMessage, initialContactActionState);
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [values, setValues] = useState<ContactFormValues>({ full_name: initialName, email: initialEmail, mobile: "", booking_ref: initialBookingRef, message: "" });
  const [captchaToken, setCaptchaToken] = useState("");
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [clientErrors, setClientErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [dismissSuccess, setDismissSuccess] = useState(false);
  const scope = useRef<HTMLElement>(null);
  const shake = useFieldShake(scope);
  const successPanelRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const turnstile = useRef<TurnstileBoxHandle>(null);
  const showSuccess = Boolean(state.ok && !dismissSuccess && !pending);

  useEffect(() => {
    if (state.ok && !pending) {
      if (!dismissSuccess) successHeadingRef.current?.focus();
      return;
    }
    if (!pending && (state.error || state.fieldErrors)) turnstile.current?.reset();
    const firstInvalid = fieldOrder.find((field) => state.fieldErrors?.[field]?.length);
    if (firstInvalid && !pending) {
      const field = document.getElementById(firstInvalid);
      field?.focus();
      shake(field);
    }
  }, [state, dismissSuccess, pending, shake]);

  useEffect(() => {
    if (dismissSuccess) firstNameRef.current?.focus();
  }, [dismissSuccess]);

  useGSAP(() => {
    const media = gsap.matchMedia(scope);
    media.add(MOTION, () => {
      gsap.from(scope.current!, { y: 24, duration: 0.55, delay: 0.28, ease: EASE_OUT, clearProps: "transform" });
    });
    return () => media.revert();
  }, { scope });

  useGSAP(() => {
    if (!showSuccess || !successPanelRef.current) return;
    const media = gsap.matchMedia(scope);
    media.add(MOTION, () => {
      gsap.from(successPanelRef.current!, {
        y: 12, opacity: 0, duration: 0.4, ease: EASE_OUT, clearProps: "transform,opacity",
      });
    });
    return () => media.revert();
  }, { scope, dependencies: [showSuccess], revertOnUpdate: true });

  function fieldError(field: ContactField): string {
    if (touched[field]) return clientErrors[field] ?? "";
    return state.fieldErrors?.[field]?.[0] ?? "";
  }

  function handleBlur(field: ContactField, value: string) {
    setTouched((previous) => ({ ...previous, [field]: true }));
    setClientErrors((previous) => ({ ...previous, [field]: validateContactField(field, value) }));
  }

  function handleChange(field: ContactField) {
    setTouched((previous) => ({ ...previous, [field]: true }));
    setClientErrors((previous) => ({ ...previous, [field]: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    if (String(formData.get("website") ?? "").trim()) return;
    const parsed = contactSchema.safeParse({
      full_name: formData.get("full_name") ?? "",
      email: formData.get("email") ?? "",
      mobile: formData.get("mobile") ?? "",
      topic: formData.get("topic") ?? "",
      booking_ref: formData.get("booking_ref") ?? "",
      message: formData.get("message") ?? "",
    });
    setTouched(Object.fromEntries(fieldOrder.map((field) => [field, true])));
    if (!parsed.success) {
      event.preventDefault();
      const errors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      setClientErrors(Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages?.[0] ?? ""])));
      const firstInvalid = fieldOrder.find((field) => errors[field]?.length);
      if (firstInvalid) {
        const field = document.getElementById(firstInvalid);
        field?.focus();
        shake(field);
      }
    } else {
      setDismissSuccess(false);
      setClientErrors({});
    }
  }

  function sendAnotherMessage() {
    setTopic(initialTopic);
    setValues({ full_name: initialName, email: initialEmail, mobile: "", booking_ref: initialBookingRef, message: "" });
    setTouched({});
    setClientErrors({});
    setDismissSuccess(true);
    turnstile.current?.reset();
  }

  const firstName = state.firstName || "there";
  const replyHours = isContactPlaceholder(contactInfo.replyWithinHours) ? "" : contactInfo.replyWithinHours;

  return (
    <section ref={scope} className="relative rounded-[22px] border border-[#D6E6F7] bg-white p-6 shadow-[0_20px_55px_rgba(10,61,145,.09)] sm:p-8 lg:p-10" aria-busy={pending}>
      {showSuccess ? (
        <div ref={successPanelRef} className="py-8 text-center sm:py-12" role="status" aria-live="polite">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#E8F7EF] text-[#1E8E5A]"><DrawCheck /></span>
          <h2 ref={successHeadingRef} tabIndex={-1} className="mt-5 text-2xl font-bold text-[#0F2342] outline-none focus-visible:ring-[3px] focus-visible:ring-[#2E9BF0]">Message received</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#51657F]">
            Thanks, {firstName}. We will reply{state.email ? ` to ${state.email}` : ""}{replyHours ? ` within ${replyHours} hours` : " as soon as we can"}.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0B63CE] px-6 text-sm font-semibold text-white hover:bg-[#0A3D91] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#2E9BF0]">Back to home</Link>
            <button type="button" onClick={sendAnotherMessage} className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#D6E6F7] px-6 text-sm font-semibold text-[#0B63CE] hover:bg-[#F3F9FF] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#2E9BF0]">Send another message</button>
          </div>
        </div>
      ) : null}

      <div hidden={showSuccess}>
        <h2 className="text-2xl font-bold tracking-tight text-[#0F2342]">Send us a message</h2>
        <p className="mt-2 text-sm text-[#51657F]">Fill in the form and we will reply by email.</p>

        <form action={formAction} onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="contact-website">Leave this field empty</label>
            <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <input type="hidden" name="captchaToken" value={captchaToken} readOnly />
          <ContactFields
            values={values}
            setValues={setValues}
            topic={topic}
            setTopic={setTopic}
            pending={pending}
            firstNameRef={firstNameRef}
            fieldError={fieldError}
            onBlur={handleBlur}
            onChange={handleChange}
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-[#0F2342]">I am not a robot</p>
            <TurnstileBox ref={turnstile} id="contact-turnstile" onTokenChange={setCaptchaToken} disabled={pending} />
          </div>
          {state.error && <p role="alert" className="rounded-xl bg-[#FFF1F1] p-3 text-sm leading-5 text-[#C62828]">{state.error}{!isContactPlaceholder(contactInfo.email) && <> Or email us at <a href={`mailto:${contactInfo.email}`} className="font-semibold underline">{contactInfo.email}</a>.</>}</p>}
          <button type="submit" disabled={pending} className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#0B63CE] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0A3D91] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#2E9BF0] disabled:cursor-wait disabled:opacity-60">
            {pending ? <><Spinner className="size-4 text-white" label="Sending message" />Sending…</> : <>Send message <Send size={16} aria-hidden="true" /></>}
          </button>
          <p className="text-center text-xs leading-5 text-[#51657F]">We use your details only to reply to you. <Link href="/privacy" className="font-medium text-[#0B63CE] underline">Privacy</Link></p>
        </form>
      </div>
    </section>
  );
}

function ContactFields({
  values,
  setValues,
  topic,
  setTopic,
  pending,
  firstNameRef,
  fieldError,
  onBlur,
  onChange,
}: {
  values: ContactFormValues;
  setValues: (values: ContactFormValues | ((previous: ContactFormValues) => ContactFormValues)) => void;
  topic: ContactTopic;
  setTopic: (topic: ContactTopic) => void;
  pending: boolean;
  firstNameRef: React.RefObject<HTMLInputElement | null>;
  fieldError: (field: ContactField) => string;
  onBlur: (field: ContactField, value: string) => void;
  onChange: (field: ContactField) => void;
}) {
  const fullNameError = fieldError("full_name");
  const emailError = fieldError("email");
  const mobileError = fieldError("mobile");
  const topicError = fieldError("topic");
  const bookingRefError = fieldError("booking_ref");
  const messageError = fieldError("message");
  const showBookingReference = topic === "booking" || topic === "payment";

  return (
    <>
      <label htmlFor="full_name" className="block text-sm font-semibold text-[#0F2342]">Full name
        <input ref={firstNameRef} id="full_name" name="full_name" type="text" autoComplete="name" required maxLength={80} value={values.full_name} disabled={pending} aria-invalid={Boolean(fullNameError)} aria-describedby={fullNameError ? "full_name-error" : undefined} onChange={(event) => { const value = event.currentTarget.value; setValues((previous) => ({ ...previous, full_name: value })); onChange("full_name"); }} onBlur={(event) => onBlur("full_name", event.currentTarget.value)} className={`${inputClass} ${fullNameError ? "border-[#C62828]" : ""}`} />
        {fullNameError && <span id="full_name-error" className="mt-1 block text-xs font-normal text-[#C62828]">{fullNameError}</span>}
      </label>

      <label htmlFor="email" className="block text-sm font-semibold text-[#0F2342]">Email address
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={120} value={values.email} disabled={pending} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "email-error" : undefined} onChange={(event) => { const value = event.currentTarget.value; setValues((previous) => ({ ...previous, email: value })); onChange("email"); }} onBlur={(event) => onBlur("email", event.currentTarget.value)} className={`${inputClass} ${emailError ? "border-[#C62828]" : ""}`} />
        {emailError && <span id="email-error" className="mt-1 block text-xs font-normal text-[#C62828]">{emailError}</span>}
      </label>

      <label htmlFor="mobile" className="block text-sm font-semibold text-[#0F2342]">Mobile number <span className="font-normal text-[#51657F]">(optional)</span>
        <input id="mobile" name="mobile" type="tel" autoComplete="tel" placeholder="09XX XXX XXXX" value={values.mobile} disabled={pending} aria-invalid={Boolean(mobileError)} aria-describedby={mobileError ? "mobile-error" : undefined} onChange={(event) => { const value = event.currentTarget.value; setValues((previous) => ({ ...previous, mobile: value })); onChange("mobile"); }} onBlur={(event) => onBlur("mobile", event.currentTarget.value)} className={`${inputClass} ${mobileError ? "border-[#C62828]" : ""}`} />
        {mobileError && <span id="mobile-error" className="mt-1 block text-xs font-normal text-[#C62828]">{mobileError}</span>}
      </label>

      <label htmlFor="topic" className="block text-sm font-semibold text-[#0F2342]">What is this about?
        <select id="topic" name="topic" value={topic} required disabled={pending} aria-invalid={Boolean(topicError)} aria-describedby={topicError ? "topic-error" : undefined} onChange={(event) => { setTopic(event.currentTarget.value as ContactTopic); onChange("topic"); }} onBlur={(event) => onBlur("topic", event.currentTarget.value)} className={`${inputClass} appearance-none ${topicError ? "border-[#C62828]" : ""}`}>
          {contactTopics.map((value) => <option value={value} key={value}>{contactTopicLabels[value]}</option>)}
        </select>
        {topicError && <span id="topic-error" className="mt-1 block text-xs font-normal text-[#C62828]">{topicError}</span>}
      </label>

      {showBookingReference && <label htmlFor="booking_ref" className="block text-sm font-semibold text-[#0F2342]">Booking reference <span className="font-normal text-[#51657F]">(optional)</span>
        <input id="booking_ref" name="booking_ref" type="text" maxLength={40} value={values.booking_ref} disabled={pending} aria-invalid={Boolean(bookingRefError)} aria-describedby={bookingRefError ? "booking_ref-error" : "booking_ref-help"} onChange={(event) => { const value = event.currentTarget.value; setValues((previous) => ({ ...previous, booking_ref: value })); onChange("booking_ref"); }} onBlur={(event) => onBlur("booking_ref", event.currentTarget.value)} className={`${inputClass} ${bookingRefError ? "border-[#C62828]" : ""}`} />
        {bookingRefError ? <span id="booking_ref-error" className="mt-1 block text-xs font-normal text-[#C62828]">{bookingRefError}</span> : <span id="booking_ref-help" className="mt-1 block text-xs font-normal text-[#51657F]">Found in My bookings. Add it if your question is about a booking.</span>}
      </label>}

      <label htmlFor="message" className="block text-sm font-semibold text-[#0F2342]">Your message
        <textarea id="message" name="message" required minLength={10} maxLength={1000} value={values.message} disabled={pending} aria-invalid={Boolean(messageError)} aria-describedby={messageError ? "message-error" : "message-help"} onChange={(event) => { const value = event.currentTarget.value; setValues((previous) => ({ ...previous, message: value })); onChange("message"); }} onBlur={(event) => onBlur("message", event.currentTarget.value)} className={`${areaClass} ${messageError ? "border-[#C62828]" : ""}`} />
        {messageError ? <span id="message-error" className="mt-1 block text-xs font-normal text-[#C62828]">{messageError}</span> : <span id="message-help" className="mt-1 block text-xs font-normal text-[#51657F]">Please do not include passwords or card numbers.</span>}
        <span className={`mt-1 block whitespace-nowrap text-right text-xs font-normal ${values.message.length >= 1000 ? "text-[#C62828]" : "text-[#51657F]"}`} aria-live="polite">{values.message.length} / 1000</span>
      </label>
    </>
  );
}
