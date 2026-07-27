import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Meet Cute - private matchmaking";
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
          background: "#f4f1ea",
          padding: "72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: "#171714",
            fontFamily: "Arial, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Meet Cute
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 78,
              color: "#171714",
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            <span>Meet someone worth knowing.</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#67635d",
              marginTop: 24,
              fontFamily: "Arial, sans-serif",
            }}
          >
            Private matchmaking. One introduction at a time. NYC + SF.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
