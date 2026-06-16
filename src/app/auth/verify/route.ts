import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeLoginToken, setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Magic-link landing. Validates and burns the token, finds or creates the
// member, opens a session, and routes them: operators to the studio, brand-new
// or still-applying people to /apply to finish their application, active
// members to the app.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const email = await consumeLoginToken(token);
  if (!email) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
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
  return NextResponse.redirect(new URL(dest, req.url));
}
