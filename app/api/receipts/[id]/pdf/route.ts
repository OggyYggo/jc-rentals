import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { paymentDate, safetyDepositCopy } from "@/lib/payment-format";
import { confirmationFooter, receiptStatuses, type Receipt } from "@/lib/payment-receipt";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", new URL(request.url).pathname);
    return Response.redirect(login, 303);
  }

  const { data: receipt, error } = await db.from("payment_receipts")
    .select("id,receipt_no,public_code,status,created_at,details").eq("id", id).maybeSingle<Receipt>();
  if (error) return new Response("Payment confirmation unavailable.", { status: 503 });
  if (!receipt) return new Response(null, { status: 404 });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const currency = (amount: number) => "PHP " + Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  const d = receipt.details;
  let page = pdf.addPage([595, 842]);
  let y = 790;

  function line(value: string, size = 11, heading = false) {
    const font = heading ? bold : regular;
    const sanitized = Array.from(value.normalize("NFC").replace(/\s+/g, " "), (character) =>
      supported.has(character.codePointAt(0)!) ? character : "?").join("");
    for (let remaining = sanitized.trim(); remaining.length;) {
      let end = remaining.length;
      while (end > 1 && font.widthOfTextAtSize(remaining.slice(0, end), size) > 499) end--;
      if (end < remaining.length && remaining.lastIndexOf(" ", end) > 0) end = remaining.lastIndexOf(" ", end);
      if (y < 55) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawText(remaining.slice(0, end), { x: 48, y, font, size, color: rgb(0.12, 0.19, 0.28) });
      remaining = remaining.slice(end).trimStart();
      y -= size + 5;
    }
    y -= 4;
  }

  line("Booking Payment Confirmation", 23, true);
  line(`${receipt.receipt_no}  |  ${receiptStatuses[receipt.status]}`, 13, true);
  y -= 12;
  line(`Booking reference: ${d.booking_reference}`);
  line(`Vehicle: ${d.vehicle}`);
  line(`Rental dates: ${d.start_date} to ${d.end_date}`);
  line(`Mode: ${d.mode === "self_drive" ? "Self-drive" : "With driver"}`);
  line(`Pickup: ${d.pickup || "Arrange with the rental owner"}`);
  line(`Rental business: ${d.owner_name}`);
  line(`Customer: ${d.customer_name}`);
  line(`Payment channel: ${d.channel}`);
  line(`Confirmed: ${paymentDate(receipt.created_at)} Manila time`);
  y -= 12;
  line(`Reservation deposit paid: ${currency(d.amount)}`, 13, true);
  line(`Balance due at pickup: ${currency(d.balance)}`, 13, true);
  if (d.safety_deposit !== null) {
    line(`Safety deposit: ${currency(d.safety_deposit)}`, 13, true);
    line(safetyDepositCopy);
  }
  y -= 14;
  line(`Verify: ${new URL(`/receipt/${receipt.public_code}`, request.url)}`, 9);
  line(confirmationFooter, 9);

  return new Response(Buffer.from(await pdf.save()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receipt.receipt_no}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
