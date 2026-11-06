import type { ReactElement } from "react";
import type { PromoCar } from "@/lib/promo/data";

export const TEMPLATES = {
  post: { width: 1080, height: 1080, src: "post", output: "png" },
  story: { width: 1080, height: 1920, src: "story", output: "png" },
  cover: { width: 1640, height: 624, src: "cover", output: "png" },
  poster: { width: 2480, height: 3508, src: "poster", output: "pdf", pageWidth: 595, pageHeight: 842 },
  sticker: { width: 1240, height: 1748, src: "sticker", output: "pdf", pageWidth: 298, pageHeight: 420 },
} as const;

type PromoTemplateName = keyof typeof TEMPLATES;
type TemplateProps = { car: PromoCar; photo: string | null; qr: string; link: string };

function rateSummary(car: PromoCar) {
  const rates = car.rates.filter((rate) => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  return {
    rates,
    startingRate: Math.min(...rates.map((rate) => Number(rate.daily_rate))),
    rateLabels: rates.map((rate) => `${rate.mode === "self_drive" ? "Self-drive" : "With driver"} ₱${Number(rate.daily_rate).toLocaleString()}`),
  };
}

function carLabel(car: PromoCar) {
  return `${car.year ? `${car.year} ` : ""}${car.brand} ${car.model}`;
}

function carPhoto(photo: string | null, width: number, height: number) {
  return photo
    ? <img src={photo} width={width} height={height} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    : <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0B63CE,#0A3D91)", color: "white", fontSize: 56, fontWeight: 700 }}>Kuyog Bohol</div>;
}

export function promoTemplate(name: PromoTemplateName, props: TemplateProps): ReactElement {
  if (name === "post") return squarePromoTemplate(props);
  const { car, photo, qr, link } = props;
  const { rates, startingRate, rateLabels } = rateSummary(car);
  const label = carLabel(car);
  const modes = [car.allows_self_drive ? "Self-drive" : null, car.allows_with_driver ? "With driver" : null].filter(Boolean).join(" · ");

  if (name === "story") return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "220px 58px 230px", background: "#fff", color: "#0F2342", fontFamily: "Arial, sans-serif" }}>
      <div style={{ height: 700, display: "flex", overflow: "hidden", borderRadius: 36, background: "#EAF4FF" }}>{carPhoto(photo, 964, 700)}</div>
      <div style={{ display: "flex", marginTop: 32, color: "#0B63CE", fontSize: 24, fontWeight: 700, letterSpacing: 3 }}>CAR RENTAL IN BOHOL</div>
      <div style={{ display: "flex", marginTop: 12, fontSize: 64, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", marginTop: 18, color: "#51657F", fontSize: 30 }}>{modes}</div>
      <div style={{ display: "flex", marginTop: 24, alignSelf: "flex-start", borderRadius: 999, background: "#0B63CE", padding: "18px 28px", color: "white", fontSize: 34, fontWeight: 700 }}>From ₱{startingRate.toLocaleString()} / day</div>
      {rates.length > 1 && <div style={{ display: "flex", marginTop: 14, color: "#51657F", fontSize: 22 }}>{rateLabels.join(" · ")}</div>}
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 32, marginTop: 28 }}><img src={qr} width="300" height="300" style={{ width: 300, height: 300 }} /><div style={{ display: "flex", flexDirection: "column", fontSize: 26, fontWeight: 700 }}><span style={{ display: "flex" }}>SCAN TO BOOK</span><span style={{ display: "flex", marginTop: 12, color: "#51657F", fontSize: 18, fontWeight: 400 }}>{link.replace(/^https?:\/\//, "")}</span></div></div>
      <div style={{ display: "flex", height: 70, alignItems: "center", justifyContent: "center", margin: "0 -58px", background: "#0A3D91", color: "white", fontSize: 22, fontWeight: 700 }}>Kuyog Bohol · Car Rental in Bohol</div>
    </div>
  );

  if (name === "cover") return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#fff", color: "#0F2342", fontFamily: "Arial, sans-serif", padding: "54px 72px", boxSizing: "border-box", gap: 54 }}>
      <div style={{ width: 790, height: 516, display: "flex", overflow: "hidden", borderRadius: 28, background: "#EAF4FF" }}>{carPhoto(photo, 790, 516)}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", color: "#0B63CE", fontSize: 18, fontWeight: 700, letterSpacing: 3 }}>CAR RENTAL IN BOHOL</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 48, lineHeight: 1.08, fontWeight: 700 }}>{label}</div>
        <div style={{ display: "flex", marginTop: 14, color: "#51657F", fontSize: 20 }}>{modes}</div>
        <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 20, borderRadius: 999, background: "#0B63CE", padding: "12px 18px", color: "white", fontSize: 20, fontWeight: 700 }}>From ₱{startingRate.toLocaleString()} / day</div>
        {rates.length > 1 && <div style={{ display: "flex", marginTop: 10, color: "#51657F", fontSize: 15 }}>{rateLabels.join(" · ")}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18 }}><img src={qr} width="150" height="150" style={{ width: 150, height: 150 }} /><div style={{ display: "flex", flexDirection: "column", color: "#0A3D91", fontSize: 16, fontWeight: 700 }}><span style={{ display: "flex" }}>SCAN TO BOOK</span><span style={{ display: "flex", marginTop: 8, color: "#51657F", fontSize: 11, fontWeight: 400 }}>{link.replace(/^https?:\/\//, "")}</span></div></div>
        <div style={{ display: "flex", marginTop: 14, color: "#0A3D91", fontSize: 17, fontWeight: 700 }}>Kuyog Bohol · Car Rental in Bohol</div>
      </div>
    </div>
  );

  const poster = name === "poster";
  const width = poster ? 2480 : 1240;
  const height = poster ? 3508 : 1748;
  const padding = poster ? 140 : 80;
  const photoHeight = poster ? 1690 : 380;
  const qrSize = poster ? 540 : 480;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box", padding, background: "#fff", color: "#0F2342", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", color: "#0B63CE", fontSize: poster ? 50 : 36, fontWeight: 700, letterSpacing: 5 }}>KUYOG BOHOL · CAR RENTAL IN BOHOL</div>
      <div style={{ display: "flex", marginTop: 22, fontSize: poster ? 110 : 72, fontWeight: 700 }}>{poster ? "Rent this car in Bohol" : "Scan to book this car"}</div>
      <div style={{ display: "flex", width: "100%", height: photoHeight, marginTop: 50, overflow: "hidden", borderRadius: poster ? 48 : 30, background: "#EAF4FF" }}>{carPhoto(photo, width - padding * 2, photoHeight)}</div>
      <div style={{ display: "flex", marginTop: 44, fontSize: poster ? 92 : 68, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", marginTop: 20, color: "#51657F", fontSize: poster ? 48 : 34 }}>{modes} · {[car.seats ? `${car.seats} seats` : null, car.transmission].filter(Boolean).join(" · ")}</div>
      <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 35, borderRadius: 999, background: "#0B63CE", padding: poster ? "28px 42px" : "20px 30px", color: "white", fontSize: poster ? 58 : 42, fontWeight: 700 }}>From ₱{startingRate.toLocaleString()} / day</div>
      {rates.length > 1 && <div style={{ display: "flex", marginTop: 18, color: "#51657F", fontSize: poster ? 36 : 28 }}>{rateLabels.join(" · ")}</div>}
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", gap: poster ? 72 : 45, marginTop: 26 }}><img src={qr} width={qrSize} height={qrSize} style={{ width: qrSize, height: qrSize }} /><div style={{ display: "flex", flexDirection: "column", fontSize: poster ? 54 : 38, fontWeight: 700 }}><span style={{ display: "flex" }}>SCAN TO BOOK</span><span style={{ display: "flex", marginTop: 18, color: "#51657F", fontSize: poster ? 26 : 19, fontWeight: 400 }}>{link.replace(/^https?:\/\//, "")}</span><span style={{ display: "flex", marginTop: 24, color: "#51657F", fontSize: poster ? 30 : 24, fontWeight: 400 }}>Offered by {car.owner?.business_name || "a local Bohol owner"}</span></div></div>
      <div style={{ display: "flex", height: poster ? 110 : 80, alignItems: "center", justifyContent: "center", margin: `0 -${padding}px -${padding}px`, background: "#0A3D91", color: "white", fontSize: poster ? 42 : 28, fontWeight: 700 }}>Kuyog Bohol · Car Rental in Bohol</div>
    </div>
  );
}

export function squarePromoTemplate({ car, photo, qr, link }: TemplateProps): ReactElement {
  const { rates, startingRate } = rateSummary(car);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", color: "#0F2342", fontFamily: "Arial, sans-serif" }}>
      <div style={{ height: 560, width: "100%", display: "flex", overflow: "hidden", background: "#EAF4FF" }}>
        {photo ? <img src={photo} width="1080" height="560" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0B63CE,#0A3D91)", color: "white", fontSize: 56, fontWeight: 700 }}>Kuyog Bohol</div>}
      </div>
      <div style={{ height: 460, display: "flex", flexDirection: "row", padding: "38px 48px 34px", boxSizing: "border-box", gap: 24 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#0B63CE", fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>CAR RENTAL IN BOHOL</div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 48, lineHeight: 1.1, fontWeight: 700 }}>{car.brand} {car.model}</div>
          <div style={{ display: "flex", marginTop: 8, color: "#51657F", fontSize: 23 }}>{[car.year, car.car_type].filter(Boolean).join(" · ")}</div>
          <div style={{ display: "flex", marginTop: 18, gap: 10, flexWrap: "wrap" }}>
            {car.allows_self_drive && <span style={{ display: "flex", padding: "9px 14px", borderRadius: 20, background: "#EAF4FF", color: "#0A3D91", fontSize: 18, fontWeight: 700 }}>Self-drive</span>}
            {car.allows_with_driver && <span style={{ display: "flex", padding: "9px 14px", borderRadius: 20, background: "#EAF4FF", color: "#0A3D91", fontSize: 18, fontWeight: 700 }}>With driver</span>}
          </div>
          <div style={{ display: "flex", marginTop: 22, color: "#51657F", fontSize: 17 }}>
            {[car.seats ? `${car.seats} seats` : null, car.transmission].filter(Boolean).join(" · ")}
          </div>
          <div style={{ display: "flex", marginTop: "auto", color: "#51657F", fontSize: 16 }}>Offered by {car.owner?.business_name || "a local Bohol owner"}</div>
        </div>
        <div style={{ width: 250, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 24, background: "#F5FAFF", padding: 16, boxSizing: "border-box" }}>
          <div style={{ display: "flex", borderRadius: 999, background: "#0B63CE", padding: "12px 18px", color: "white", fontSize: 22, fontWeight: 700, whiteSpace: "nowrap" }}>From ₱{startingRate.toLocaleString()} / day</div>
          {rates.length > 1 && <div style={{ display: "flex", marginTop: 7, color: "#51657F", fontSize: 11, textAlign: "center" }}>{rates.map((rate) => `${rate.mode === "self_drive" ? "Self-drive" : "With driver"} ₱${Number(rate.daily_rate).toLocaleString()}`).join(" · ")}</div>}
          <img src={qr} width="150" height="150" style={{ width: 150, height: 150, marginTop: 14 }} />
          <div style={{ display: "flex", marginTop: 4, color: "#0A3D91", fontSize: 16, fontWeight: 700 }}>SCAN TO BOOK</div>
          <div style={{ display: "flex", marginTop: 9, color: "#51657F", fontSize: 12, textAlign: "center" }}>{link.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>
      <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "#0A3D91", color: "white", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>Kuyog Bohol · Car Rental in Bohol</div>
    </div>
  );
}

export function generalBrandTemplate(qr: string, link: string): ReactElement {
  return (
    <div style={{ width: 1080, height: 1080, display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", padding: 74, background: "#EAF4FF", color: "#0F2342", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center" }}>
        <div style={{ display: "flex", color: "#0B63CE", fontSize: 25, fontWeight: 700, letterSpacing: 5 }}>EXPLORE BOHOL</div>
        <div style={{ display: "flex", marginTop: 30, fontSize: 76, lineHeight: 1.08, fontWeight: 700 }}>Book a car in Bohol.</div>
        <div style={{ display: "flex", marginTop: 18, color: "#51657F", fontSize: 34 }}>Self-drive or with a local driver.</div>
        <div style={{ display: "flex", marginTop: 36, gap: 22, alignItems: "center", borderRadius: 26, padding: 18, background: "white" }}><img src={qr} width="220" height="220" style={{ width: 220, height: 220 }}/><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", fontSize: 22, fontWeight: 700 }}><span style={{ display: "flex" }}>SCAN TO BROWSE CARS</span><span style={{ display: "flex", marginTop: 12, color: "#51657F", fontSize: 15, fontWeight: 400 }}>{link.replace(/^https?:\/\//, "")}</span></div></div>
      </div>
      <div style={{ display: "flex", height: 86, alignItems: "center", justifyContent: "center", margin: "0 -74px -74px", background: "#0A3D91", color: "white", fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>Kuyog Bohol · Car Rental in Bohol</div>
    </div>
  );
}
