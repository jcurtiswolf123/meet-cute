// One browser check, one visitor.
//
// Every rate limit in the product is keyed on the caller's address, and
// lib/ratelimit.ts holds its counters in a module-scoped Map when REDIS_URL is
// unset, which is always in the sandbox. A dev server is one process, so those
// counters live for as long as the server does. Nothing resets them between
// runs.
//
// Left alone, every browser check therefore arrives as the same visitor. Next's
// dev server stamps `x-forwarded-for: 127.0.0.1` on every request and
// requestIp() reads x-forwarded-for before x-real-ip, so run one, run forty and
// the parallel contexts inside a single run all share the bucket
// `magic:ip:127.0.0.1`. Sending a sign-in link is capped at ten per address per
// hour, so the eleventh send in an hour redirects to /apply?error=throttled and
// the journey waits, which accept sent=1 and error=send, time out.
//
// Measured against the sandbox on 2026-08-19: sends 1 to 10 returned sent=1 and
// sends 11 and 12 returned error=throttled, then test:journey:signin failed at
// scripts/test-signin-recovery.ts:42 on exactly that URL. That is not a flaky
// test, it is a test that gets one hour of runs and then stops working, and the
// count it has left depends on what else ran before it.
//
// Widening the waits to accept error=throttled would be the wrong fix. Those
// assertions exist to stop the page claiming a success it did not earn, and
// test-signin-recovery goes on to require the DeliveryJob row that a throttled
// request never creates.
//
// So give each context its own address. The limits are still enforced, per
// visitor, exactly as in production; the checks simply stop pretending that
// forty independent runs came from one machine. Addresses come from the RFC
// 5737 and RFC 3849 documentation ranges so they can never collide with a real
// client.
//
// This is for the LOCAL checks only. Never use it against a deployed
// environment: there the caller's address is set by the platform, spoofing it
// would prove nothing, and prod-application-walk.ts and deploy-check.ts are
// deliberately left on the real one.
import { randomBytes } from "node:crypto";
import type { Browser, BrowserContext, BrowserContextOptions } from "playwright";

/** A fresh documentation address, unique per call.
 *
 *  IPv6 from 2001:db8::/32 rather than IPv4 from 192.0.2.0/24, because the v4
 *  documentation blocks hold 254 addresses each and a long session would start
 *  reusing buckets. The value is only ever a map key, so the width is free. */
export function journeyClientIp(): string {
  const hex = randomBytes(8).toString("hex");
  return `2001:db8:${hex.slice(0, 4)}:${hex.slice(4, 8)}:${hex.slice(8, 12)}:${hex.slice(12, 16)}::1`;
}

/**
 * `browser.newContext()`, with this context presented as its own visitor.
 *
 * Both headers are set because requestIp() and clientKey() read
 * x-forwarded-for first and x-real-ip second, and a caller that only set the
 * second one would be silently ignored behind Next's dev server. Any
 * `extraHTTPHeaders` passed in are kept; pass the two names explicitly to
 * override, which is what a check that means to exercise the limiter should do.
 */
export async function journeyContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const ip = journeyClientIp();
  return browser.newContext({
    ...options,
    extraHTTPHeaders: {
      "x-forwarded-for": ip,
      "x-real-ip": ip,
      ...(options.extraHTTPHeaders ?? {}),
    },
  });
}
