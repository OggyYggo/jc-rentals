import { ImageResponse } from "next/og";

export const alt = "Kuyog Bohol car rental in Bohol";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      padding: 88,
      background: "#0A47B1",
      color: "white",
    }}>
      <div style={{ fontSize: 38, fontWeight: 700 }}>Kuyog Bohol</div>
      <div style={{ marginTop: 32, fontSize: 82, fontWeight: 700 }}>Car Rental in Bohol</div>
      <div style={{ marginTop: 20, fontSize: 32 }}>Self-drive or with a local driver · kuyogbohol.app</div>
    </div>,
    size,
  );
}
