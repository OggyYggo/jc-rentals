import Link from "next/link";
import { connection } from "next/server";
import { PublicFooter } from "@/components/public-footer";
import { cancellationRule, refundOwnerCopy, refundSupportCopy } from "@/lib/cancellation";
import { readCancellationSettings } from "@/lib/cancellation-settings";
import { cancellationPolicy } from "@/lib/policies/cancellation";
import { publicMetadata } from "@/lib/site/public-metadata";

export const instant = false;
export const metadata = publicMetadata("/terms", "Terms of Service",
  "Read Kuyog Bohol?s rental and payment terms, including booking deposits, cancellation fees, motorcycle requirements and the owner agreement.");

export default async function TermsPage() {
  await connection();
  const { hours, percent, pickupHour, supportDays } = await readCancellationSettings();

  // Draft for legal review before launch.
  return <>
    <main className="mx-auto w-full max-w-3xl px-5 py-12 text-slate-800">
      <Link href="/" className="text-sm text-blue-700">Back to Kuyog Bohol</Link>
      <h1 className="mt-5 text-3xl font-semibold">Rental and payment terms</h1>
      <div className="mt-6 space-y-5 text-sm leading-6 text-slate-600">
        <section>
          <h2 className="font-semibold text-slate-900">Platform role</h2>
          <p>Kuyog Bohol operates a marketplace for customers and independent vehicle owners. The vehicle owner supplies the vehicle, receives customer payments directly, and is responsible for the rental, payment verification, and deposit refunds.</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">Booking deposit</h2>
          <p>Pay the reservation deposit directly to the vehicle owner by the deadline on your booking. The owner confirms the booking after verifying the transfer. Unpaid requests expire when the payment window ends. If you upload proof in time, the vehicle remains reserved through the review deadline shown in your booking.</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">Remaining balance and security deposit</h2>
          <p>Pay the remaining rental balance directly to the owner at pickup. The owner collects and returns any separate self-drive security deposit under the rental agreement.</p>
        </section>
        <section id="cancellation" className="scroll-mt-24 space-y-2">
          <h2 className="font-semibold text-slate-900">{cancellationPolicy.title}</h2>
          <ul className="list-disc space-y-1 pl-5">{cancellationPolicy.points.map(point => <li key={point}>{point}</li>)}</ul>
          <p>{cancellationRule(hours, percent)}</p>
          <p>The default pickup reference time is {String(pickupHour).padStart(2, "0")}:00 Manila time when no pickup time is specified. Some owners have a different policy. Review the cutoff and fee in your booking before paying.</p>
          <p>A no-show can incur the late cancellation fee.</p>
          <p>{refundOwnerCopy}</p>
          <p>{refundSupportCopy(supportDays)}</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">Vehicle condition and responsibility</h2>
          <p>Review the owner?s rental terms and inspect the vehicle together at pickup and return. Follow the agreed use, fuel, mileage, and return requirements. Report accidents, damage, or theft promptly to the owner. The rental agreement and applicable law govern responsibility for damage, fines, and security deposit deductions.</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">Motorcycle rentals</h2>
          <p>A valid license class for motorcycles is required for self-drive. Rider and passenger must wear helmets. A motorcycle may carry at most two people. Off-road riding and racing are prohibited. Customers pay for fuel and traffic fines. Review any insurance coverage and exclusions with the owner before pickup.</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">Owner agreement and platform fees</h2>
          <p>The standard owner commission is 5% of the rental amount unless the owner?s plan or agreement specifies another rate. A retained cancellation fee may be subject to commission under the owner?s agreement. Owners must keep bookings started through Kuyog Bohol on the platform and use the payment instructions shown on each booking.</p>
        </section>
        <p>For support or a booking dispute, email kuyogbohol@gmail.com.</p>
      </div>
    </main>
    <PublicFooter />
  </>;
}
