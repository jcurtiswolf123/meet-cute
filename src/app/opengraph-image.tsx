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
          background: "#fbf5ec",
          padding: "72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 34, color: "#382a20" }}>
          Meet Cute <span style={{ color: "#d76a45" }}>♥</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 78, color: "#382a20", lineHeight: 1.05, maxWidth: 980 }}>
            <span>We help you&nbsp;</span>
            <span style={{ color: "#d76a45", fontStyle: "italic" }}>meet</span>
            <span>, date, and stay together.</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#7d6f62", marginTop: 24 }}>
            Premium matchmaking, by introduction only. NYC + SF.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
