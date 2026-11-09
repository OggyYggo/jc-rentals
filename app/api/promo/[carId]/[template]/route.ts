import { ImageResponse } from "next/og";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { loadCarForPromo } from "@/lib/promo/data";
import { carShortUrl, getSiteOrigin, qrDataUrl } from "@/lib/promo/qr";
import { getPromoImageAssets } from "@/lib/promo/image-assets";
import { promoTemplate, TEMPLATES } from "@/lib/promo/templates";

async function imageAsJpegDataUrl(url: string | null) {
  if (!url) return null;
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageOrigin || new URL(url).origin !== new URL(storageOrigin).origin) return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const jpeg = await sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ carId: string; template: string }> }) {
  const { carId, template } = await params;
  if (!Object.hasOwn(TEMPLATES, template)) return new Response("Unknown promo template", { status: 404 });
  const tpl = TEMPLATES[template as keyof typeof TEMPLATES];

  const car = await loadCarForPromo(carId);
  if (!car) return new Response("This active car is not available to your account", { status: 403 });
  if (!car.short_code) return new Response("Apply the promo kit migration before generating downloads", { status: 409 });

  const link = carShortUrl(car.short_code, tpl.src, getSiteOrigin(new URL(request.url).origin));
  const [photo, qr, { fonts, logo }] = await Promise.all([imageAsJpegDataUrl(car.photoUrl), qrDataUrl(link), getPromoImageAssets()]);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const response = new ImageResponse(promoTemplate(template as keyof typeof TEMPLATES, { car, photo, qr, link, logo }), {
    width: tpl.width,
    height: tpl.height,
    fonts,
    headers: {
      ...(download && tpl.output === "png" ? { "Content-Disposition": `attachment; filename="kuyog-bohol-${car.short_code}-${template}.png"` } : {}),
      "Cache-Control": "private, max-age=300",
    },
  });
  if (download && tpl.output === "pdf") {
    const pdf = await PDFDocument.create();
    const pageWidth = tpl.pageWidth!;
    const pageHeight = tpl.pageHeight!;
    const page = pdf.addPage([pageWidth, pageHeight]);
    const png = await pdf.embedPng(new Uint8Array(await response.arrayBuffer()));
    page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const pdfBytes = Uint8Array.from(await pdf.save());
    return new Response(new Blob([pdfBytes], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="kuyog-bohol-${car.short_code}-${template}.pdf"`, "Cache-Control": "private, max-age=300" } });
  }
  return response;
}
