import { NextResponse } from "next/server";
import { getSessionSubject } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { photoAt } from "@/lib/photo-url";

export const dynamic = "force-dynamic";

// The one question the native shell has to answer before it can draw anything:
// is this cookie signed in, and is the person behind it an operator. The app
// builds a member tab bar or a studio tab bar off the answer, so guessing wrong
// means a member sees studio tabs that 403 or an operator has to type a URL.
//
// Deliberately narrow. This returns only what the caller already knows about
// themselves, and it returns 200 with `signedIn: false` rather than 401, because
// a signed-out app is a normal state and not an error to log.
export async function GET() {
  const me = await getSessionSubject();
  if (!me) {
    return NextResponse.json(
      { signedIn: false },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // The avatar is the only thing not already on the session row, and the shell
  // draws it at 32 points, so ask for the one photo at the size it is painted.
  const photo = await prisma.photo.findFirst({
    where: { personId: me.id, status: "approved" },
    orderBy: { order: "asc" },
    select: { url: true },
  });

  return NextResponse.json(
    {
      signedIn: true,
      personId: me.id,
      name: me.name,
      email: me.email,
      status: me.status,
      isOperator: me.isOperator,
      isSuperAdmin: me.isSuperAdmin,
      hasApplied: me.appliedAt !== null,
      startedApplication: me.basicsAt !== null,
      avatarUrl: photo ? photoAt(photo.url, 96) : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
