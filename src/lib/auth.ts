import { cookies } from "next/headers";
import { prisma } from "./prisma";

// Lightweight session for v1: a signed-enough cookie holding the acting person id.
// Dev login lets you act as any seeded member; operators get the /studio backend.
const COOKIE = "mc_session";

export async function setSession(personId: string) {
  const jar = await cookies();
  jar.set(COOKIE, personId, {
    httpOnly: true,
    sameSite: "lax",
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
  return jar.get(COOKIE)?.value ?? null;
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
