import { NextRequest, NextResponse } from "next/server";
import { seededNameFor } from "@/lib/application-steps";
import { prisma } from "@/lib/prisma";
import { scheduleUnfinishedApplicationNudge } from "@/lib/actions";
import { cancelScheduledMail } from "@/lib/delivery";
import { consumeLoginToken, setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Magic-link landing. Validates and burns the token, finds or creates the
// member, opens a session, and routes them: operators to the studio, brand-new
// or still-applying people to /apply to finish their application, active
// members to the app.
export async function GET(req: NextRequest) {
  // Behind Fly, req.url's host is the internal bind (0.0.0.0:3009), so redirects
  // must use the public origin or the browser lands on a dead address.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
  const to = (path: string) => NextResponse.redirect(new URL(path, base));

  const token = req.nextUrl.searchParams.get("token") || "";
  const email = await consumeLoginToken(token);
  if (!email) {
    return to("/login?error=expired");
  }

  let person = await prisma.person.findUnique({ where: { email } });
  if (!person) {
    // Public signup: a brand-new email becomes an applicant who completes their
    // profile at /apply. Never created as active; vetting promotes them.
    // Shared with the application, which has to be able to tell this invented
    // name apart from one somebody actually typed.
    const name = seededNameFor(email);
    person = await prisma.person.create({
      data: { email, name, city: "NYC", status: "applicant" },
    });
  }

  // They came in, so the "your link expired" follow-up is withdrawn before it
  // can tell somebody who is already signed in that they are not.
  await cancelScheduledMail("signin_unused", email);

  await setSession(person.id, req.headers.get("user-agent") || undefined);

  // Someone signing in with an unfinished application gets one chase a day
  // later, withdrawn the moment they submit. Best effort: a failure here must
  // never cost somebody their sign-in.
  try {
    await scheduleUnfinishedApplicationNudge(person);
  } catch (error) {
    console.error(`[auth] could not schedule the application chase: ${(error as Error).message}`);
  }

  const dest = person.isOperator ? "/studio" : person.status === "applicant" ? "/apply" : "/app";
  return to(dest);
}
