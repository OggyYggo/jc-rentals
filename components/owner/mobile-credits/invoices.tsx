import { paymentPeso } from "@/lib/payment-format";
import { creditDate, creditMonth, type Invoice } from "./data";
import { CreditsHeading } from "./navigation";
import { creditsHref, danger, panel, panelShape, positive, screen, warning } from "./styles";

const dayMs = 86_400_000;

export function MobileInvoices({ invoices, today, history }: { invoices: Invoice[]; today: string; history: boolean }) {
  const unpaid = invoices.filter(invoice => invoice.status !== "paid");
  const earliest = unpaid.flatMap(invoice => invoice.due_date ? [invoice.due_date] : []).sort()[0];
  const days = earliest ? (Date.parse(earliest) - Date.parse(today)) / dayMs : null;
  const due = unpaid.reduce((total, invoice) => total + Number(invoice.commission_due), 0);
  return <div className={screen}>
    <CreditsHeading back={history ? "Credits" : "Money"} href={history ? creditsHref : "/owner"}
      history={!history} title="Invoices" description="Monthly platform fees for your bookings." />
    <section className={`${panelShape} border-[#E3EEF9] ${days !== null && days < 0 ? danger : unpaid.length ? warning : "bg-[#EAF4FF]"}`}>
      <h2 className="text-sm font-semibold">Amount due</h2>
      <p className="mt-1 break-words font-heading text-3xl font-bold">{paymentPeso(due)}</p>
      {earliest && days !== null && <p className="mt-1 text-sm">
        Due {creditDate(earliest)} · {days < 0 ? `${Math.abs(days)} ${days === -1 ? "day" : "days"} overdue`
          : days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} left`}
      </p>}
    </section>
    {invoices.length ? <ul className="space-y-3">
      {invoices.map(invoice => {
        const paid = invoice.status === "paid";
        const overdue = !paid && !!invoice.due_date && invoice.due_date < today;
        const date = paid ? invoice.paid_at : invoice.due_date;
        return <li key={invoice.id} className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading font-bold">{creditMonth(invoice.period_month)}</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paid ? positive : overdue ? danger : warning}`}>
              {paid ? "Paid" : overdue ? "Overdue" : "Due"}
            </span>
          </div>
          <p className="mt-2 break-words font-heading text-xl font-bold">{paymentPeso(invoice.commission_due)}</p>
          {date && <p className="mt-1 text-sm text-[#5B6F89]">{paid ? "Paid" : "Due"} {creditDate(date)}</p>}
          <p className="mt-1 break-words text-sm text-[#5B6F89]">
            {invoice.total_bookings} {invoice.total_bookings === 1 ? "booking" : "bookings"} · {paymentPeso(invoice.gross_amount)} in bookings
          </p>
        </li>;
      })}
    </ul> : <p className={`${panel} text-sm text-[#5B6F89]`}>No invoices yet.</p>}
    <p className="text-center text-sm text-[#5B6F89]">Invoice owners are billed monthly. Credits are not used.</p>
  </div>;
}
