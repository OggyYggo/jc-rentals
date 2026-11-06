import { ImageResponse } from "next/og";
import { canAccessPromoKit } from "@/lib/promo/data";
import { getSiteOrigin, qrDataUrl } from "@/lib/promo/qr";
import { generalBrandTemplate } from "@/lib/promo/templates";

export async function GET(request: Request, { params }: { params: Promise<{ template: string }> }) {
  const { template } = await params;
  if (template !== "post") return new Response("Unknown promo template", { status: 404 });
  if (!await canAccessPromoKit()) return new Response("Forbidden", { status: 403 });

  const link = `${getSiteOrigin(new URL(request.url).origin)}/`;
  const qr = await qrDataUrl(link);
  return new ImageResponse(generalBrandTemplate(qr, link), {
    width: 1080,
    height: 1080,
    headers: {
      ...(new URL(request.url).searchParams.get("download") === "1" ? { "Content-Disposition": "attachment; filename=\"kuyog-bohol-general-post.png\"" } : {}),
      "Cache-Control": "private, max-age=300",
    },
  });
}
