import { NextRequest, NextResponse } from "next/server";
import { seededNameFor } from "@/lib/application-steps";
import { prisma } from "@/lib/prisma";
import { scheduleUnfinishedApplicationNudge } from "@/lib/actions";
import { cancelScheduledMail } from "@/lib/delivery";
import { consumeLoginCode, normalizeEmail, setSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// The six-digit code, burned in the app rather than in Safari.
//
// This is /auth/verify for a code instead of a link, and it exists because the
// link cannot get a session into the app: tapping it in Mail opens Safari, the
// cookie lands there, and the app is still signed out. The shell loads this in
// a web view so the Set-Cookie reaches WKWebsiteDataStore.default(), which is
// the jar every tab and the session probe read.
//
// It is a GET carrying the code, matching /auth/verify carrying a token. That
// is not a CSRF hole worth closing: forging this request requires the code,
// and anybody holding the code can sign in anyway. What it does allow is a
// third party burning codes they cannot use, which is what the caps below are
// for. They are the same caps as signInWithCode, deliberately: two front doors
// on one lock must not have two different guess budgets.
export async function GET(req: NextRequest) {
  // Behind Fly, req.url's host is the internal bind (0.0.0.0:3009), so
  // redirects must use the public origin or the app lands on a dead address.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
  const to = (path: string) => NextResponse.redirect(new URL(path, base));

  const email = normalizeEmail(req.nextUrl.searchParams.get("email") || "");
  const code = req.nextUrl.searchParams.get("code") || "";

  const xff = req.headers.get("x-forwarded-for");
  const ip = (
    req.headers.get("fly-client-ip") ||
    (xff ? xff.split(",").map((v) => v.trim()).filter(Boolean).at(-1) : "") ||
    req.headers.get("x-real-ip") ||
    "anon"
  ).trim();

  // Five tries per address per 15 minutes, against a million codes, is a one in
  // 200,000 chance of a hit inside one window. The IP cap is what stops the
  // same attacker walking a list of addresses.
  const emailOk = (await rateLimit(`code:email:${email}`, 5, 15 * 60 * 1000)).ok;
  const ipOk = (await rateLimit(`code:ip:${ip}`, 20, 15 * 60 * 1000)).ok;
  if (!emailOk || !ipOk) return to("/login?error=throttled");

  const verified = await consumeLoginCode(email, code);
  if (!verified) return to("/login?error=code");

  // From here this is exactly what /auth/verify does with a link, and for the
  // same reason: a code and a link prove the same thing, so they must not drift
  // into two different notions of who is signed in.
  let person = await prisma.person.findUnique({ where: { email: verified } });
  if (!person) {
    const name = seededNameFor(verified);
    person = await prisma.person.create({
      data: { email: verified, name, city: "NYC", status: "applicant" },
    });
  }

  await cancelScheduledMail("signin_unused", verified);
  await setSession(person.id, req.headers.get("user-agent") || undefined);

  // Best effort: a failure here must never cost somebody their sign-in.
  try {
    await scheduleUnfinishedApplicationNudge(person);
  } catch (error) {
    console.error(`[auth] could not schedule the application chase: ${(error as Error).message}`);
  }

  return to(person.isOperator ? "/studio" : person.status === "applicant" ? "/apply" : "/app");
}
