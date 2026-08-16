// Home-screen icons for the installed app, drawn from the brand rather than
// resized from a screenshot.
//
//   npx tsx scripts/make-app-icons.ts
//
// Committed output, because it changes about once a year and a build step that
// needs a rasteriser is a build step that breaks on somebody else's machine.
//
// Two shapes, on purpose:
//  - `any`: the mark inset on its ground, which is what Safari draws. iOS
//    applies its own corner radius and will not mask a transparent icon, so a
//    home-screen icon must be opaque and square.
//  - `maskable`: the same mark inside the 40% safe circle Android crops to. A
//    single icon cannot be both: an `any` icon cropped to a circle loses its
//    edges, and a maskable one drawn as `any` floats in dead space.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "icons");

const CREAM = "#f4f1ea";
const EMBER = "#762d38";
const INK = "#171714";

/** The wordmark's M, centred, at `scale` of the canvas. */
function markSvg(size: number, scale: number, ground: string, foreground: string): string {
  const r = Math.round(size * 0.5);
  const font = Math.round(size * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ground}"/>
  <circle cx="${r}" cy="${r}" r="${Math.round(size * 0.34)}" fill="none" stroke="${foreground}" stroke-opacity="0.28" stroke-width="${Math.max(1, Math.round(size * 0.012))}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Times New Roman', serif" font-size="${font}" fill="${foreground}">M</text>
</svg>`;
}

async function png(svg: string, size: number, file: string) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, file), buf);
  console.log(`  ${file}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)}kb`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log("icons:");

  // Safari and the manifest's `any` purpose. Opaque, mark at 52%.
  for (const size of [180, 192, 512]) {
    await png(markSvg(size, 0.52, EMBER, CREAM), size, `icon-${size}.png`);
  }

  // Android masks to a circle inscribed in the middle 80%, so the mark sits
  // smaller and the ground runs to every edge.
  for (const size of [192, 512]) {
    await png(markSvg(size, 0.38, EMBER, CREAM), size, `icon-maskable-${size}.png`);
  }

  // The browser tab. Ink on cream reads at 32px where cream on ember does not.
  await png(markSvg(64, 0.62, CREAM, INK), 64, "favicon-64.png");
  await png(markSvg(32, 0.62, CREAM, INK), 32, "favicon-32.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
