# Mutuals for iOS

A WKWebView shell around hellomutuals.com. Not a rewrite: the studio and the
member app are server rendered and change most weeks, and a second native
implementation would be a second thing to keep correct. What it buys over the
home-screen web app is a real icon, a launch screen, pull to refresh, and links
to other people's sites opening in Safari instead of inside the session.

## Read this before promising it to anybody

The signing team is **Joshua Wolf (Personal Team), `YHTTPDR58N`, free**. Xcode
records it as `isFreeProvisioningTeam = 1`. That has three consequences, and the
third is the one that matters:

1. A build installed from here **stops launching after 7 days**. Reinstall with
   the commands below.
2. It installs only on devices this Mac has paired with, over a cable.
3. **It cannot be given to anybody else.** No TestFlight, no ad-hoc, no
   registering someone else's device. A free team has none of those.

So the way somebody who is not Joshua gets Mutuals on a phone is the installable
web app: Safari, hellomutuals.com/app, Share, Add to Home Screen. Same icon,
same full-screen chrome, no expiry, no cable, no Apple account.

Changing that means the paid Apple Developer Program ($99/yr), an App Store
Connect record, an upload, and TestFlight review for external testers. Worth it
when there are enough people to hand it to; it is not worth it for one.

## Build and install

```bash
cd ios
xcodegen generate          # the .xcodeproj is generated, never committed
xcodebuild -project Mutuals.xcodeproj -scheme Mutuals \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates build

xcrun devicectl list devices          # find the phone, unlock it first
xcrun devicectl device install app --device <UDID> \
  ~/Library/Developer/Xcode/DerivedData/Mutuals-*/Build/Products/Debug-iphoneos/Mutuals.app
xcrun devicectl device process launch --device <UDID> com.joshuawolf.mutuals
```

**The phone must be unlocked** for the install, or it fails with
`kAMDMobileImageMounterDeviceLocked`. That is the whole error; it is not a
signing problem.

## What is in here

- `project.yml` : XcodeGen input. Bundle id `com.joshuawolf.mutuals`, iOS 17,
  portrait, light only, because every page is cream and light only.
- `Mutuals/MutualsApp.swift` : the whole app. Persistent data store so the
  30-day session cookie survives a relaunch; pull to refresh; external links and
  `mailto:`/`tel:` handed to Safari rather than rendered inside the session; a
  native offline view for a first launch with no network, since the web offline
  page is served by the service worker and needs one successful visit first.
- `Mutuals/Assets.xcassets` : the icon, from the same mark as the web icons in
  `scripts/make-app-icons.ts`.

## Sign-in inside the shell

Use the **six-digit code**, not the emailed link. A link tapped in Mail opens
Safari, which signs in Safari rather than the app. The code is typed into the
screen that asked for it, so the session lands in the app's own cookie jar. This
is the same reason the code exists for the home-screen web app; see
`createLoginCode` in `src/lib/auth.ts`.
