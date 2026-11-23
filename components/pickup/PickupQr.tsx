import { pickupQrMarkup } from "@/lib/pickup/qr";

export function PickupQr({ url, mobileCompact = false }: { url: string; mobileCompact?: boolean }) {
  const { side, content } = pickupQrMarkup(url, "/icon-512.png");
  return <svg viewBox={`0 0 ${side} ${side}`} role="img" aria-label="Pickup pass QR code"
    className={`mx-auto aspect-square w-full max-w-[300px] bg-white print:min-w-[4cm] ${mobileCompact ? "max-md:max-w-[216px]" : ""}`}
    dangerouslySetInnerHTML={{ __html: content }} />;
}
