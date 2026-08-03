// The "we're going here" link in the connection email.
//
// It has to work from an email client with no session, for either person, and it
// must not be guessable: knowing a match id should not let a stranger write to
// that match. So the link carries the match id plus an HMAC of it, keyed on
// SESSION_SECRET. No new token column, nothing to expire or rotate, and forging
// one requires the server secret.
//
// This records intent, not a reservation. Mutuals holds no tables and the copy
// never says otherwise (see CLAUDE.md: venue booking is manual).
import { createHmac, timingSafeEqual } from "crypto";

// Read per call rather than at module load. Next.js populates the environment
// before any module runs, so both are equivalent in production, but a
// load-time constant silently bakes in an empty secret anywhere the module is
// imported first (tests, scripts, the worker), which would disable the link
// with no error at all.
function secret(): string {
  return process.env.SESSION_SECRET || "";
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
}

/** Absolute "we're going here" URL for one venue on one match. */
export function datePickUrl(token: string, venueId: string): string {
  return `${appBaseUrl()}/d/${encodeURIComponent(token)}/${encodeURIComponent(venueId)}`;
}

/** Short signature over the match id. 16 bytes of base64url is far past what is
 *  needed to stop guessing while keeping the emailed URL short enough to read. */
function sign(matchId: string): string {
  return createHmac("sha256", secret()).update(`datepick:${matchId}`).digest("base64url").slice(0, 22);
}

/** Token embedded in the email link. Empty string when no secret is configured,
 *  which callers treat as "do not offer the link" rather than shipping an
 *  unsigned one. */
export function datePickToken(matchId: string): string {
  if (!secret() || !matchId) return "";
  return `${matchId}.${sign(matchId)}`;
}

/** Recover the match id from a token, or null if the signature does not verify.
 *  Compared in constant time so the signature cannot be discovered byte by byte
 *  from response timing. */
export function verifyDatePickToken(token: string): string | null {
  if (!secret() || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const matchId = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(matchId));
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return matchId;
}
