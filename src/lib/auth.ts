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

export async function getSessionPersonId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hash(token) } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.personId;
}

export async function getCurrentPerson() {
  const id = await getSessionPersonId();
  if (!id) return null;
  return prisma.person.findUnique({
    include: { photos: true, prompts: true },
    where: { id },
  });
}

export async function requireOperator() {
  const p = await getCurrentPerson();
  if (!hasOperatorAccess(p)) return null;
  return p;
}

export async function requireSuperAdmin() {
  const p = await getCurrentPerson();
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
