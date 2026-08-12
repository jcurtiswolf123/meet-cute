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
  const row = await prisma.loginToken.findUnique({ where: { tokenHash: hash(rawToken) } });
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) return null;
  const consumed = await prisma.loginToken.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return null;
  return row.email;
}
