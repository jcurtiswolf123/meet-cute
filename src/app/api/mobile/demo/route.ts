import { NextResponse, type NextRequest } from "next/server";
import { isLocalDemoLogin } from "@/lib/demo-login";
import { setSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// One-tap sign-in for the app, against a sandbox, so a build on a real phone
// can be opened and used without copying a magic link off the Mac and onto the
// device for every test.
//
// The web already has this as `loginAs`, but that is a server action: the app
// cannot call it without the action id and the encryption key, and both change
// per build. This is the same thing as a URL the web view can load, which is
// what matters, because the session cookie has to land in the app's own jar.
//
// Three gates, all of which must hold:
//
//   - `isLocalDemoLogin()` is the same check the web's demo buttons use, and it
//     requires NODE_ENV to be something other than production AND
//     MUTUALS_DEMO_LOGIN=1. Only `npm run sandbox` sets that.
//   - production answers 404 rather than 403, so nothing advertises that the
//     route exists at all.
//   - the person has to already be an operator or an active member in that
//     database. The sandbox database is seeded and thrown away.
//
// It is a GET with a side effect, which is normally how you get a CSRF hole.
// It is acceptable here only because the route does not exist outside a local
// sandbox: there is no session worth forging on a throwaway database, and the
// production build has no such handler to reach.
export async function GET(request: NextRequest) {
  if (!isLocalDemoLogin()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const role = request.nextUrl.searchParams.get("as") === "operator" ? "operator" : "member";

  const person =
    role === "operator"
      ? await prisma.person.findFirst({
          where: { isOperator: true, status: "active" },
          orderBy: { name: "asc" },
        })
      : await prisma.person.findFirst({
          where: { isOperator: false, status: "active" },
          orderBy: { name: "asc" },
        });

  if (!person) {
    return new NextResponse(`No seeded ${role} to sign in as. Run npm run sandbox:up.`, {
      status: 409,
    });
  }

  await setSession(person.id);

  // Redirected rather than answered with JSON: the app loads this in a web
  // view, and landing on the real page means the tab it lands in is already
  // warm rather than showing a blank frame behind the shell.
  //
  // Built from the Host header the request actually arrived on, not from
  // nextUrl, which normalises to localhost. A phone asks on the Mac's LAN
  // address, and a redirect to localhost is one the app correctly refuses to
  // follow as its own, so sign-in would bounce into an in-app browser.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = `${request.nextUrl.protocol}//${host}`;
  return NextResponse.redirect(new URL(person.isOperator ? "/studio" : "/app", origin), {
    headers: { "cache-control": "no-store" },
  });
}
