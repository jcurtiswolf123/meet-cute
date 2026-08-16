/* Mutuals service worker.
 *
 * It exists for two reasons and no others: so the app is installable to a home
 * screen on every platform (Chrome will not offer an install without one), and
 * so a phone that drops off the network gets a page that says so instead of the
 * browser's dinosaur.
 *
 * WHAT IT MUST NEVER CACHE, and why this file is short:
 * every HTML response in this product is personalised and signed in. Studio
 * pages are somebody's whole roster, /app is one member's connections, and
 * /i/<token> is an introduction addressed to one person. All of them are
 * `force-dynamic` on the server for that reason. A service worker that cached
 * a navigation would hand back a signed-in page after sign-out, on a device
 * that may not be its owner's. So: static build output only, and even that
 * only where the URL is content-hashed or an icon.
 *
 * Bump VERSION to evict everything on the next visit.
 */
const VERSION = "v1";
const STATIC_CACHE = `mutuals-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      // A failed precache must not leave a worker that never activates.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Content-hashed build output and icons. Everything else is off limits. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname.startsWith("/brand/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations go to the network, always. On failure, and only on failure,
  // the offline page. Nothing signed in is ever stored.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  // Cache first: these URLs are content-hashed, so a hit is always correct and
  // a miss is a one-off fetch that then sticks.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    }),
  );
});
