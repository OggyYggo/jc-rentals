import { OwnerHelp } from "@/components/onboarding/owner-help";
import { contactInbox } from "@/lib/contact/mail";
import { getOwnerContext } from "@/lib/owner-context";
import { readMinimum, readReviewHours } from "@/lib/onboarding/owner";

export const instant = false;

export default async function OwnerHelpPage({ searchParams }: PageProps<"/owner/help">) {
  const [context, query] = await Promise.all([getOwnerContext(), searchParams]);
  const [minimum, reviewHours] = await Promise.all([readMinimum(context), readReviewHours()]);
  return <OwnerHelp settings={{ minimum, reviewHours, invoice: context.owner.fee_mode === "invoice" }}
    rate={Number(context.owner.commission_rate) * 100} email={contactInbox(process.env.CONTACT_INBOX_EMAIL)}
    openDeposit={query.guide === "deposit"} />;
}
