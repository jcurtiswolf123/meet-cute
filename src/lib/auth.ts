import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

// Session: the cookie holds `${personId}.${hmac}` signed with SESSION_SECRET.
// httpOnly + sameSite + secure, and the signature is verified on every read,
// so a cookie cannot be forged to impersonate an arbitrary id. (A real
// deployment would use opaque tokens in a Session table for revocation; this
// is the right shape for a single-tenant demo.)
const COOKIE = "mc_session";
const SECRET = process.env.SESSION_SECRET || "meet-cute-dev-secret-change-me";

function sign(personId: string): string {
  const mac = createHmac("sha256", SECRET).update(personId).digest("base64url");
  return `${personId}.${mac}`;
}

function verify(value: string | undefined): string | null {
  if (!value || !value.includes(".")) return null;
  const idx = value.lastIndexOf(".");
  const personId = value.slice(0, idx);
  const mac = value.slice(idx + 1);
  const expected = createHmac("sha256", SECRET).update(personId).digest("base64url");
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return personId;
}

export async function setSession(personId: string) {
  const jar = await cookies();
  jar.set(COOKIE, sign(personId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionPersonId(): Promise<string | null> {
  const jar = await cookies();
  return verify(jar.get(COOKIE)?.value);
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
  if (!p || !p.isOperator) return null;
  return p;
}
