// Tiny in-memory sliding-window rate limiter. Works on a single instance
// (the Fly deployment). For multi-instance, swap in Upstash/Redis.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  hits.set(key, arr);
  // opportunistic cleanup
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

export function clientKey(req: Request): string {
  // Prefer the platform-set client IP (not spoofable). x-forwarded-for's
  // leftmost token is client-controlled, so fall back to its RIGHTMOST entry
  // (the hop the trusted proxy saw) before x-real-ip.
  const fly = req.headers.get("fly-client-ip");
  if (fly) return fly.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return (req.headers.get("x-real-ip") || "anon").trim();
}
