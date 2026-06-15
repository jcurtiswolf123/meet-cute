import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Meet Cute - premium matchmaking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#faf7f2",
          padding: "72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 34, color: "#1f1a16" }}>
          Meet Cute <span style={{ color: "#9b2d3b" }}>♥</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 78, color: "#1f1a16", lineHeight: 1.05, maxWidth: 980 }}>
            <span>We help you&nbsp;</span>
            <span style={{ color: "#9b2d3b", fontStyle: "italic" }}>meet</span>
            <span>, date, and stay together.</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#6b6258", marginTop: 24 }}>
            Premium matchmaking, by introduction only. NYC + SF.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
