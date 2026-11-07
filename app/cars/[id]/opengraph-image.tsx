import { ImageResponse } from "next/og";
import { connection } from "next/server";
import sharp from "sharp";
import { getPublicPromoCar } from "@/lib/promo/data";

export const alt = "Car rental in Bohol from Kuyog Bohol";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function imageAsJpegDataUrl(url: string | null) {
  if (!url) return null;
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageOrigin || new URL(url).origin !== new URL(storageOrigin).origin) return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const jpeg = await sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const car = await getPublicPromoCar(id);
  if (!car) return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#0A3D91", color: "white", fontSize: 56 }}>Kuyog Bohol · Car Rental in Bohol</div>, size);

  const [photo] = await Promise.all([imageAsJpegDataUrl(car.photoUrl)]);
  const rates = car.rates.filter((rate) => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  const from = rates.length ? Math.min(...rates.map((rate) => Number(rate.daily_rate))) : null;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#EAF4FF", color: "#0F2342", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", width: 680, height: "100%", overflow: "hidden", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0B63CE,#0A3D91)" }}>
        {photo && <img src={photo} width="680" height="630" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "45px 48px" }}>
        <div style={{ display: "flex", color: "#0B63CE", fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>CAR RENTAL IN BOHOL</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 49, lineHeight: 1.1, fontWeight: 700 }}>{car.brand} {car.model}</div>
        <div style={{ display: "flex", marginTop: 12, color: "#51657F", fontSize: 22 }}>{[car.year, car.car_type].filter(Boolean).join(" · ")}</div>
        {from !== null && <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 30, borderRadius: 999, padding: "14px 20px", background: "#0B63CE", color: "white", fontSize: 24, fontWeight: 700 }}>From ₱{from.toLocaleString()} / day</div>}
        <div style={{ display: "flex", marginTop: 30, color: "#0A3D91", fontSize: 20, fontWeight: 700 }}>Kuyog Bohol · Book online</div>
      </div>
    </div>,
    size,
  );
}
