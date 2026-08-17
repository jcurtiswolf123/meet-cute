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

The signing team is **`YHTTPDR58N`, Joshua Wolf (Personal Team), free**. It is
the only team this Mac has; read it back with

```bash
defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier
```

`project.yml` named `J8M8Z862Z7` until 2026-08-16, which is the certificate's
identifier and not a team Xcode will resolve, so builds failed to provision.

On a **free** Apple ID the app expires after seven days and has to be rebuilt.
On a paid membership it lasts a year, and TestFlight is the way to hand it to
anybody else.

## The endpoints, and which of them exist in production

The shell asks `/api/mobile/session` before it draws anything, so a deployment
without these puts "hellomutuals.com is running a build without the app
endpoints" on the phone. That is the app's own copy, from `AppState.swift`, not
an iOS message, which is why searching Apple's documentation for it finds
nothing.

| route | production | why |
|---|---|---|
| `/api/mobile/session` | yes | who this cookie is, and whether they see the studio |
| `/api/mobile/code` | yes | the six digits, burned in the app rather than in Safari |
| `/api/mobile/login` | yes | the JSON half of `/login` |
| `/api/mobile/logout` | yes | needs `X-Mutuals-Client` |
| `/api/mobile/demo` | **404, by design** | `isLocalDemoLogin()` needs `NODE_ENV` to not be production |

So the contract is four routes in a sandbox and four in production, but `demo`
is a deliberate 404 rather than a missing deploy. Do not "fix" it, and do not
let the shell treat its absence as a broken deployment: the one-tap buttons are
already drawn only when the backend is Local dev. A credential-free login
against the live roster is the thing that must not exist, because the only
non-operator accounts there are real members.

## After the cable comes out

A build made by `./run.sh --device` keeps working unplugged, but only because
two things are true, and both have been false here before:

- **It has to be pointed at production.** `Backend.local` is `npm run dev` on
  the Mac over the LAN, so it dies the moment the cable comes out, the phone
  leaves the wifi, or the Mac sleeps. `AppState.init` picks `.local` on its own
  whenever `MutualsLocalHost` is baked into the bundle, so a build meant to
  leave the house must not carry `MUTUALS_LOCAL_HOST`. Check the shipped bundle,
  not the source: `/usr/libexec/PlistBuddy -c 'Print :MutualsLocalHost'
  <built>/Mutuals.app/Info.plist` has to print nothing.
- **The choice is sticky.** The backend lives in `UserDefaults`, which survives
  a reinstall over the top. Installing on a phone that was on Local dev leaves
  it on Local dev. `xcrun devicectl device uninstall app` first and it comes up
  on production.

Reinstalling wipes the cookie jar with the container, so sign in again with the
six-digit code.

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
