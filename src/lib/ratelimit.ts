// Rate limiter. Uses Redis (Fly-managed Upstash) when REDIS_URL is set, so the
// limit holds across multiple instances at scale. Falls back to an in-memory
// sliding window when there is no Redis or Redis is unreachable, so local dev
// and any Redis outage degrade gracefully instead of breaking requests.
import Redis from "ioredis";

type Result = { ok: boolean; retryAfter: number };

// --- Redis (shared, multi-instance) ------------------------------------------
let redis: Redis | null = null;
let redisDisabled = false;

function getRedis(): Redis | null {
  if (redisDisabled || !process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      lazyConnect: false,
    });
    // On any connection error, stop using Redis for this process and fall back
    // to memory rather than throwing on every request.
    redis.on("error", () => {
      redisDisabled = true;
    });
  }
  return redis;
}

// --- in-memory fallback ------------------------------------------------------
const hits = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

/** Fixed-window limit. Async (Redis-backed when available). */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<Result> {
  const r = getRedis();
  if (r) {
    try {
      const k = `rl:${key}`;
      const count = await r.incr(k);
      if (count === 1) await r.pexpire(k, windowMs);
      if (count > limit) {
        const ttl = await r.pttl(k);
        return { ok: false, retryAfter: Math.ceil((ttl > 0 ? ttl : windowMs) / 1000) };
      }
      return { ok: true, retryAfter: 0 };
    } catch {
      // fall through to memory on any Redis hiccup
    }
  }
  return memoryLimit(key, limit, windowMs);
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
