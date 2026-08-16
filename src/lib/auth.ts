import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { prisma } from "./prisma";

// Auth model: opaque, revocable sessions.
//
// The cookie holds a random 256-bit token. We store only its SHA-256 hash in
// the Session table, so a database leak cannot be replayed as a live session.
// Sign-out, account deletion, or an admin revoke just deletes the row. Magic
// links are a second short-lived single-use token, also hashed at rest.
const COOKIE = "mc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const LOGIN_TTL_MS = 1000 * 60 * 15; // 15 minutes

function newToken(): string {
  return randomBytes(32).toString("base64url");
}
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type OperatorAccessSubject = {
  isOperator: boolean;
  isSuperAdmin: boolean;
};

type OperatorRevocationSubject = OperatorAccessSubject & {
  id: string;
};

export function hasOperatorAccess(person: OperatorAccessSubject | null | undefined): boolean {
  return person?.isOperator === true;
}

export function hasSuperAdminAccess(person: OperatorAccessSubject | null | undefined): boolean {
  return person?.isOperator === true && person.isSuperAdmin === true;
}

export function canRevokeOperatorAccess(
  actor: OperatorRevocationSubject | null | undefined,
  target: OperatorRevocationSubject | null | undefined,
): boolean {
  return (
    hasSuperAdminAccess(actor) &&
    target?.isOperator === true &&
    target.isSuperAdmin === false &&
    actor?.id !== target.id
  );
}

// --- sessions ----------------------------------------------------------------

export async function setSession(personId: string, userAgent?: string) {
  const token = newToken();
  await prisma.session.create({
    data: {
      tokenHash: hash(token),
      personId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 255),
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hash(token) } });
  }
  jar.delete(COOKIE);
}

// Who the cookie belongs to, and enough of them to authorize the request.
//
// This is the one query every signed-in page starts with, so it is the one that
// pays the region gap twice: Fly runs the app in sjc and Neon holds the data in
// us-east-2, about 50ms away. It used to be four round trips - the session row,
// then the person, then their photos, then their prompts - and Next renders a
// layout and its page concurrently, so both called it and the studio spent
// eight round trips, roughly four tenths of a second, answering "is this an
// operator" before it read anything an operator came to see.
//
// Now it is one: the person rides along on the session row through a join, only
// the columns an authorization decision needs, and React's `cache` makes the
// layout and the page share the single answer. Photos and prompts are not part
// of authorizing anyone; the pages that render them ask for them.
const authPersonFields = {
  id: true,
  name: true,
  email: true,
  status: true,
  isOperator: true,
  isSuperAdmin: true,
  appliedAt: true,
  basicsAt: true,
} as const;

export type SessionSubject = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  isOperator: boolean;
  isSuperAdmin: boolean;
  appliedAt: Date | null;
  basicsAt: Date | null;
};

/** The signed-in person, in one round trip, deduplicated across a request. */
export const getSessionSubject = cache(async (): Promise<SessionSubject | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hash(token) },
    relationLoadStrategy: "join",
    select: { id: true, expiresAt: true, person: { select: authPersonFields } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    // Fire and forget: the caller is already unauthenticated, and making them
    // wait a cross-region round trip for a cleanup delete helps nobody.
    void prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.person;
});

export async function getSessionPersonId(): Promise<string | null> {
  return (await getSessionSubject())?.id ?? null;
}

/** The signed-in person with the profile relations the member surfaces render.
 *  Deliberately not cached: server actions read this after writing to the row. */
export async function getCurrentPerson() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hash(token) },
    relationLoadStrategy: "join",
    select: {
      id: true,
      expiresAt: true,
      person: { include: { photos: true, prompts: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    void prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.person;
}

// Authorization only, so these read the lean subject: a server action that
// checks who is calling has no use for the caller's photos or prompts, and
// fetching them cost two extra cross-region round trips before every write.
export async function requireOperator() {
  const p = await getSessionSubject();
  if (!hasOperatorAccess(p)) return null;
  return p;
}

export async function requireSuperAdmin() {
  const p = await getSessionSubject();
  if (!hasSuperAdminAccess(p)) return null;
  return p;
}

// --- magic-link tokens -------------------------------------------------------

/** Create a single-use login token for an email. Returns the raw token to embed
 *  in the link (only its hash is stored). */
export async function createLoginToken(email: string): Promise<string> {
  const token = newToken();
  await prisma.loginToken.create({
    data: {
      tokenHash: hash(token),
      email: normalizeEmail(email),
      expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
    },
  });
  return token;
}

// --- sign-in codes -----------------------------------------------------------
//
// The same email carries a link and a six-digit code, because on a phone the
// link is the part that breaks.
//
// An iOS home-screen web app runs in its own WebKit data store, separate from
// Safari's. A magic link tapped in Mail opens in Safari, so the session lands
// in Safari's cookie jar and the installed app is still signed out. The user
// taps the icon, sees the sign-in screen again, and has no way out of the loop.
// A code is typed into whichever surface asked for it, so the session lands
// where the person actually is. The same is true of a native WKWebView shell.
//
// A code is a LoginToken row like any other, so expiry, single use, the burn
// and the purge are all the behaviour that already exists and is already
// tested. Only the hashed material differs: a code is scoped to the address it
// was sent to, since six digits are not unique on their own and two people must
// never be able to hold the same one.
const CODE_ALPHABET = "0123456789";
const CODE_LENGTH = 6;

function codeHashInput(email: string, code: string): string {
  return `logincode:${normalizeEmail(email)}:${code}`;
}

function newCode(): string {
  // rejection-sampled so the digits are uniform: `% 10` over a byte would make
  // 0 through 5 slightly likelier than 6 through 9.
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= 250) continue;
      out += CODE_ALPHABET[byte % 10];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/** Mint a six-digit sign-in code for an email. Returns the code to put in the
 *  email body; only its hash is stored. */
export async function createLoginCode(email: string): Promise<string> {
  const normalized = normalizeEmail(email);
  // `tokenHash` is unique and a code is only six digits, so two requests for the
  // same address inside the same 15 minutes can collide. Three tries is beyond
  // generous at a one-in-a-million-per-try collision rate.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    try {
      await prisma.loginToken.create({
        data: {
          tokenHash: hash(codeHashInput(normalized, code)),
          email: normalized,
          expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
        },
      });
      return code;
    } catch {
      /* unique collision, or a write that failed for its own reasons: try again */
    }
  }
  throw new Error("could not mint a sign-in code");
}

/** Validate and burn a sign-in code. Returns the normalized email or null.
 *  Callers must rate limit: six digits is a small space and the only thing
 *  standing between it and a guess is how many guesses are allowed. */
export async function consumeLoginCode(email: string, code: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const digits = (code || "").replace(/\D/g, "");
  if (!normalized || digits.length !== CODE_LENGTH) return null;
  return consumeTokenHash(hash(codeHashInput(normalized, digits)));
}

/** Best-effort cleanup of expired sessions and spent/expired login tokens so
 *  those tables do not grow unbounded at scale. Safe to call opportunistically. */
export async function purgeExpiredAuth(): Promise<void> {
  const now = new Date();
  try {
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.loginToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
      }),
    ]);
  } catch {
    /* non-fatal */
  }
}

/** Validate and burn a login token. Returns the normalized email or null. */
export async function consumeLoginToken(rawToken: string): Promise<string | null> {
  if (!rawToken) return null;
  return consumeTokenHash(hash(rawToken));
}

/** The burn, shared by the emailed link and the typed code. The conditional
 *  update is what makes it single use: two requests racing on the same row both
 *  read `consumedAt: null`, and only the one whose UPDATE matches gets a count
 *  of 1. */
async function consumeTokenHash(tokenHash: string): Promise<string | null> {
  const row = await prisma.loginToken.findUnique({ where: { tokenHash } });
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) return null;
  const consumed = await prisma.loginToken.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return null;
  return row.email;
}
