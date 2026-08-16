# Putting Mutuals on a real iPhone

The simulator build is done and QA'd. This is what it takes to get the same
build onto a phone, what it will talk to once it is there, and the two things
only Joshua can do.

## What the app talks to on a phone

Production is not an option yet. `hellomutuals.com` answers 404 for
`/api/mobile/session` and `/api/mobile/login`, because the branch that adds them
has not been deployed. The app detects this exactly and says so on screen:
"hellomutuals.com is running a build without the app endpoints." Selecting
Production on the phone will show that, correctly, until the deploy happens.

So the phone points at the Mac, over the LAN, at the sandbox. Throwaway data,
every outbound provider blanked, cannot email or text a real person.

## Two blockers, both Joshua's

**1. Xcode has no Apple account.** The project signs as team `J8M8Z862Z7` and
the build fails with:

```
error: No Account for Team "J8M8Z862Z7". Add a new account in Accounts settings
error: No profiles for 'com.joshuawolf.mutuals' were found
```

Fix: Xcode → Settings → Accounts → **+** → Apple ID → sign in with the account
that owns that team. Automatic signing takes it from there; a free personal team
is enough for this app, because the associated-domains entitlement is not wired
into the build (`CODE_SIGN_ENTITLEMENTS` is empty). That costs universal links
and nothing else: signing in uses the pasted-link route, which is what the QA
pass used throughout.

**2. The phone is not in developer mode.** `Wolf 1` is paired and visible, but
the build fails with "The developer disk image could not be mounted on this
device."

Fix, on the phone: unlock it and leave it unlocked, then Settings → Privacy &
Security → Developer Mode → on, which asks for a restart. Plug it in, and answer
Trust This Computer.

## Then, one run

Start the sandbox so it calls itself by the Mac's LAN address rather than
127.0.0.1. Without this the phone can load pages but cannot sign in: the verify
redirect lands on 127.0.0.1, the app decides the redirect belongs to a different
site, and hands it to an in-app browser that cannot reach it either.

```bash
cd ~/Projects/meet-cute-sessions/ios
ipconfig getifaddr en0                      # the address to use below
SANDBOX_HOST=<that-address> npm run sandbox:up
SANDBOX_HOST=<that-address> npm run sandbox
```

Build and install, with the phone unlocked and connected:

```bash
cd ~/Projects/meet-cute-sessions/ios/ios
xcodebuild -project Mutuals.xcodeproj -scheme Mutuals -configuration Debug \
  -destination "platform=iOS,id=96D33F7C-02E8-54BE-B0FE-9492003F3EAD" \
  -derivedDataPath ~/Library/Developer/Xcode/DerivedData/Mutuals-device \
  -allowProvisioningUpdates build

xcrun devicectl device install app \
  --device 96D33F7C-02E8-54BE-B0FE-9492003F3EAD \
  ~/Library/Developer/Xcode/DerivedData/Mutuals-device/Build/Products/Debug-iphoneos/Mutuals.app
```

First launch on a personal team: Settings → General → VPN & Device Management →
trust the developer certificate. A personal-team build expires after seven days
and needs the same two commands again.

## On the phone, once

Open Mutuals, tap the ellipsis, and under Backend set:

- **Talking to**: Local dev
- **Your Mac**: `<that-address>:3060`

The Host row at the bottom of the sheet should then read the same thing. If it
says "Nothing is listening on ...", the message now names the real host and
port: check the sandbox is running and that the phone is on the same wifi.

To sign in, generate a link on the Mac and get it onto the phone's clipboard
(AirDrop, or Messages to yourself), then tap **Paste sign-in link**:

```bash
cd ~/Projects/meet-cute-sessions/ios
set -a; . ./.env.sandbox; set +a
npx tsx scripts/login-link.ts ben@example.com          # a member
npx tsx scripts/login-link.ts zoe@hellomutuals.com     # an operator, lands in the studio
npx tsx scripts/login-link.ts jesswolflord@gmail.com   # superadmin
```

Typing the address and tapping "Send the link" also works and exercises
`/api/mobile/login`, but the sandbox cannot actually send mail, so the link has
to come from the command above either way.

## When production is the target instead

Deploy the branch, then the phone can use Production and none of the LAN setup
applies. That deploy also puts the new display face and the five-tab shell in
front of real members, so it is a release rather than a test install. See
`docs/BRAND-RENAME.md` for the A2P campaign note before shipping copy changes.

_Written 2026-08-15, after the design and functional QA pass._
