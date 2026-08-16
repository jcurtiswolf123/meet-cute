import { NextResponse } from "next/server";

export const dynamic = "force-static";

// Universal links for the iOS app.
//
// This is what makes a sign-in link tapped in Mail open inside Mutuals with the
// session cookie landing in the app's own cookie jar, instead of opening Safari
// and leaving the app signed out. It has to be served from the apex host, over
// https, as application/json, with no redirect: a route handler rather than a
// file in public/, because Next serves unknown extensions as octet-stream and
// iOS refuses the association without the JSON content type.
//
// APP_ID is `<team id>.<bundle id>`. It lives in the environment rather than in
// the file so a rebuild is not needed to move teams; ios/project.yml carries
// the same two values for the app target.
const APP_ID = process.env.IOS_APP_ID || "J8M8Z862Z7.com.joshuawolf.mutuals";

const association = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [
          // The paths worth opening in the app. Everything else (marketing,
          // /apply, /r/<token> written by a friend who has no app) stays in the
          // browser on purpose.
          { "/": "/auth/verify*", comment: "sign-in link, so the session lands in the app" },
          { "/": "/app", comment: "member home" },
          { "/": "/app/*" },
          { "/": "/i/*", comment: "an introduction invitation" },
          { "/": "/studio", comment: "operator studio" },
          { "/": "/studio/*" },
        ],
      },
    ],
  },
  webcredentials: { apps: [APP_ID] },
};

export async function GET() {
  return NextResponse.json(association, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
