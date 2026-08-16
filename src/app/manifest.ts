import type { MetadataRoute } from "next";

// Makes the site installable to a phone's home screen. Served at
// /manifest.webmanifest by Next's metadata route.
//
// `start_url` is the member app, not the marketing page: somebody who installs
// this wants their connections, not the pitch. An operator installing it lands
// on /app too and taps through to /studio once; the icon is the same app.
//
// iOS ignores most of this and reads the `apple-*` meta tags in layout.tsx
// instead. Both are needed: the manifest is what Android and desktop Chrome
// read, the meta tags are what Safari reads.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mutuals",
    short_name: "Mutuals",
    description: "Curated, one-to-one introductions made by a real matchmaker.",
    start_url: "/app",
    // Where a link into the app opens in the installed window rather than
    // bouncing out to the browser. Deliberately the whole origin: an operator's
    // /studio and an emailed /i/<token> invitation both belong inside the app.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Cream, so the launch screen and the bar behind the status bar match the
    // page rather than flashing white.
    background_color: "#f4f1ea",
    theme_color: "#f4f1ea",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Connections", url: "/app/connections" },
      { name: "Studio", url: "/studio" },
    ],
  };
}
