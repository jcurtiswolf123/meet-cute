# Mutuals for iOS

The member app and the operator studio, on a phone, as one app.

```bash
./run.sh                 # build and run in the simulator
./run.sh --device        # build, install, and launch on a connected iPhone
./run.sh --open          # regenerate the project and open Xcode
```

## What this is, and what it deliberately is not

It is a native shell over the same routes `hellomutuals.com` serves: a real tab
bar, a real navigation bar, a native sign-in screen, native error states, the
system share sheet, haptics, and the camera and photo pickers a member needs to
upload a face. Each tab holds its own web view, kept alive across tab switches,
and all of them share one cookie jar, so signing in once signs the whole app in.

It is not a second implementation of the product. Mutuals is server-rendered
with server actions and has no read/write API; a native client would mean
building that API, then keeping two clients honest against it forever, for a
product whose entire surface is six member pages and twelve studio pages. The
shell is the honest shape for it today. If the studio ever needs offline work or
push, that is the point to reconsider, one screen at a time.

What the app adds over Safari is the part that actually matters on a phone: it
stays signed in, the tabs are where your thumb is, the web sidebar and the web
mobile header are hidden so there is one set of navigation instead of two, and
a sign-in link opens the app rather than a browser the app cannot see.

## Layout

```
ios/
  project.yml            XcodeGen spec. The .xcodeproj is generated, not committed.
  run.sh                 build, install, launch
  tools/make-icon.py     regenerates the app icon and the launch mark
  Mutuals/
    App/                 entry point, state, routing, backend selection
    Web/                 WKWebView plumbing, navigation policy, the JS bridge
    Screens/             sign-in, the member shell, the studio shell, settings
    Design/Theme.swift   the palette and type from DESIGN.md
    Resources/           Info.plist, entitlements, asset catalog
```

## The web side of it

Four things in the Next app exist for this shell:

- **`/api/mobile/session`** answers "is this cookie signed in, and is it an
  operator". The app cannot draw a tab bar until it knows.
- **`/api/mobile/login`** mails a sign-in link, so the app can have a native
  sign-in screen. It is a transport over `lib/magic-link.ts`, which is also what
  the `/login` form uses: one implementation of the rate limits and the
  link-origin rule, two callers.
- **`/api/mobile/logout`** is `clearSession` behind a route, because the web app
  signs out through a server action the app cannot call.
- **`/.well-known/apple-app-site-association`** is the universal-links file.

Plus one CSS block. `bridge.js` sets `data-native="ios"` on `<html>` at document
start, and `globals.css` uses it to hide the portal sidebar, the mobile header,
and the site footer, and to stop iOS zooming on the studio's 12px inputs. It is
set by the app rather than from the user agent on the server because reading a
header in the root layout would make every static marketing page dynamic.

## Signing in

Mutuals has no passwords. An address gets a one-time link, and clicking it is
what creates the session, which is awkward in an app because the link opens
wherever the system sends it. Two ways in:

1. **Universal links.** `/auth/verify` is in the app's associated domains, so
   the link tapped in Mail opens here and the cookie lands in the app's own jar.
   Needs a **paid Apple Developer membership** to provision the entitlement, and
   is opt-in: `./run.sh --universal-links`.
2. **The pasted link.** Copy it out of the email, tap "Paste sign-in link".
   Works on any build, including a free personal team. The app refuses a link
   that is not `/auth/verify` on the backend it is currently pointed at, because
   a production link pasted into a local build would burn a single-use token
   against the wrong host.

Either way the link is loaded in a web view and not a URLSession, because
`/auth/verify` answers with a `Set-Cookie` and the cookie has to land in the jar
every tab reads.

## Production or local

Settings names which one, in words. A build pointed at a throwaway database and
a build pointed at the live roster look identical once a page has rendered, and
the difference is whether tapping "Introduce" emails two real people.

- **Production** is `hellomutuals.com`.
- **Local dev** is `npm run dev` on the Mac. The simulator shares the Mac's
  localhost; a real phone does not, so put the Mac's address on the network in
  the "Mac address" field (a port may be included, e.g. `192.168.1.20:3009`).

## Getting it onto a phone

1. Plug the iPhone in, unlock it, and trust the Mac.
2. `./run.sh --device`
3. On the phone: Settings > General > VPN & Device Management > Developer App >
   Trust. Only needed the first time.

On a **free** Apple ID the app expires after seven days and has to be rebuilt.
On a paid membership it lasts a year, and TestFlight is the way to hand it to
anybody else.

## The bridge

`window.mutuals` is available on every page inside the app, and every call is a
no-op in a normal browser, so nothing needs feature detection beyond
`window.mutuals?.`:

```js
window.mutuals.haptic("success")           // a decision that committed
window.mutuals.share(url, title)           // the system share sheet
window.mutuals.openExternal(url)           // leave the app deliberately
window.mutuals.sessionChanged()            // the shell re-reads the session
window.mutuals.setTitle("Applicants")      // the native navigation bar
```

Keep it small. Everything a member or an operator does is still ordinary web
navigation; this is not a place to move product logic.

## Regenerating the icon

`python3 tools/make-icon.py`. Two circles and the part they share: Mutuals is
the overlap, so the icon is the overlap and nothing else.
