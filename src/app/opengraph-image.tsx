import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Mutuals - curated matchmaking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// This route is prerendered at build time (see the build output: `○
// /opengraph-image`), so the font fetches below run in CI and never on a
// request. Satori has no system fonts, so without them the card rendered in a
// generic sans and the shared link preview did not look like the site. Both
// faces have to load together: register only one and Satori uses it for every
// element, which put the wordmark and the subline in the display serif.
// Failure falls back to the old system-stack behaviour, never a broken build.
async function loadFont(family: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}&display=swap`,
      // A browser UA is what makes Google serve a TTF/WOFF rather than WOFF2,
      // which Satori cannot parse.
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } },
    ).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src:\s*url\((https:\/\/[^)]+)\)/)?.[1];
    if (!url) return null;
    const font = await fetch(url);
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OG() {
  // The wordmark is set at 700, so the bold face has to be registered too or
  // Satori fakes it off the regular.
  const [serif, sans, sansBold] = await Promise.all([
    loadFont("Instrument+Serif"),
    loadFont("Instrument+Sans"),
    loadFont("Instrument+Sans:wght@700"),
  ]);
  // Only use the brand faces when all three arrived, so the card never renders
  // half in Instrument and half in a fallback.
  const branded = Boolean(serif && sans && sansBold);
  const displayFamily = branded ? "Instrument Serif" : "Georgia, serif";
  const uiFamily = branded ? "Instrument Sans" : "Arial, sans-serif";

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
          fontFamily: displayFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: "#171714",
            fontFamily: uiFamily,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Mutuals
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
            <span>Meet your friend&rsquo;s friends.</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#67635d",
              marginTop: 24,
              fontFamily: uiFamily,
            }}
          >
            Curated matchmaking. One introduction at a time. NYC + SF.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: branded
        ? [
            { name: "Instrument Serif", data: serif!, weight: 400 as const, style: "normal" as const },
            { name: "Instrument Sans", data: sans!, weight: 400 as const, style: "normal" as const },
            { name: "Instrument Sans", data: sansBold!, weight: 700 as const, style: "normal" as const },
          ]
        : undefined,
    },
  );
}
