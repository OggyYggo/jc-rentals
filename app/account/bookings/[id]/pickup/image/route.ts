import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { bookingIdPattern, type PickupPass } from "@/lib/pickup/model";
import { pickupOrigin } from "@/lib/pickup/origin";
import { pickupQrMarkup } from "@/lib/pickup/qr";
import { paymentPeso } from "@/lib/payment-format";

function xml(value: string) {
  return value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!bookingIdPattern.test(id)) return new Response(null, { status: 404 });
  const db = await createClient();
  const { data } = await db.rpc("get_my_pickup_pass", { p_booking: id });
  const pass = data as PickupPass | null;
  const origin = await pickupOrigin().catch(() => null);
  if (!origin || !pass?.token || !pass.backup_code || !["ready","today"].includes(pass.state)) return new Response(null, { status: 404 });
  const logo = await readFile(path.join(process.cwd(), "public/icon-512.png"));
  const qr = pickupQrMarkup(`${origin}/p/${pass.token}`, `data:image/png;base64,${logo.toString("base64")}`);
  const lines = [pass.reference, pass.vehicle_label, `${pass.start_date} to ${pass.end_date}`, `Balance at pickup: ${paymentPeso(pass.balance_at_pickup)}`];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="830">
    <rect width="640" height="830" fill="white"/><rect x="10" y="10" width="620" height="810" rx="22" fill="none" stroke="#D6E6F7" stroke-width="3"/>
    <g text-anchor="middle" font-family="sans-serif" fill="#0A3D91">
      <text x="320" y="68" font-size="32" font-weight="bold">Kuyog Bohol · Pickup pass</text>
      <svg x="72" y="85" width="496" height="496" viewBox="0 0 ${qr.side} ${qr.side}">${qr.content}</svg>
      <text x="320" y="596" font-size="20">Backup code</text><text x="320" y="649" font-size="52" font-weight="bold" letter-spacing="7">${pass.backup_code.replace(/(.{3})/, "$1 ")}</text>
      ${lines.map((line,index) => `<text x="320" y="${692 + index * 30}" font-size="22">${xml(line.slice(0,46))}</text>`).join("")}
    </g></svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(image), { headers: {
    "Content-Type": "image/png",
    "Content-Disposition": `attachment; filename="kuyog-bohol-pickup-pass-${pass.reference.replace(/[^a-z0-9-]/gi, "")}.png"`,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  } });
}
