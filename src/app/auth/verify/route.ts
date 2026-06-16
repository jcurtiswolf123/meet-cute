import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    const name = local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) : "New member";
    person = await prisma.person.create({
      data: { email, name, city: "NYC", status: "applicant" },
    });
  }

  await setSession(person.id, req.headers.get("user-agent") || undefined);

  const dest = person.isOperator ? "/studio" : person.status === "applicant" ? "/apply" : "/app";
  return to(dest);
}
