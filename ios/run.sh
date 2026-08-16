#!/usr/bin/env bash
# Build and run Mutuals.
#
#   ./run.sh                     simulator (default), build and launch
#   ./run.sh --device            your iPhone, over USB or wifi
#   ./run.sh --open              regenerate and open Xcode, nothing else
#   ./run.sh --universal-links   include the associated-domains entitlement
#                                (needs a paid Apple Developer membership)
#
# The Xcode project is generated from project.yml and is not committed: editing
# a pbxproj by hand is how two people end up with different build settings.
set -euo pipefail

cd "$(dirname "$0")"

TARGET="simulator"
OPEN_ONLY=0
export MUTUALS_ENTITLEMENTS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) TARGET="device" ;;
    --simulator) TARGET="simulator" ;;
    --open) OPEN_ONLY=1 ;;
    --universal-links) export MUTUALS_ENTITLEMENTS="Mutuals/Resources/Mutuals.entitlements" ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v xcodegen >/dev/null || {
  echo "xcodegen is missing: brew install xcodegen" >&2
  exit 1
}

echo "==> generating Mutuals.xcodeproj"
xcodegen generate --quiet

if [[ "$OPEN_ONLY" == 1 ]]; then
  open Mutuals.xcodeproj
  exit 0
fi

if [[ "$TARGET" == "device" ]]; then
  DEVICE_ID="${MUTUALS_DEVICE_ID:-$(xcrun devicectl list devices --quiet 2>/dev/null \
    | awk '/connected/ {print $3; exit}')}"
  if [[ -z "${DEVICE_ID:-}" ]]; then
    cat >&2 <<'MSG'
No iPhone is connected.

Plug it in (or pair it over wifi in Xcode: Window > Devices and Simulators),
unlock it, and trust this Mac. Then run this again.

First install on a device also needs the profile trusted on the phone:
Settings > General > VPN & Device Management > Developer App > Trust.
MSG
    exit 1
  fi
  echo "==> building for device $DEVICE_ID"
  xcodebuild -project Mutuals.xcodeproj -scheme Mutuals -configuration Debug \
    -destination "id=$DEVICE_ID" -allowProvisioningUpdates build
  APP=$(xcodebuild -project Mutuals.xcodeproj -scheme Mutuals -configuration Debug \
    -destination "id=$DEVICE_ID" -showBuildSettings 2>/dev/null \
    | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{d=$2} / FULL_PRODUCT_NAME /{n=$2} END{print d"/"n}')
  echo "==> installing $APP"
  xcrun devicectl device install app --device "$DEVICE_ID" "$APP"
  xcrun devicectl device process launch --device "$DEVICE_ID" com.joshuawolf.mutuals
  exit 0
fi

SIM="${MUTUALS_SIM:-iPhone 17 Pro}"
echo "==> building for the $SIM simulator"
xcodebuild -project Mutuals.xcodeproj -scheme Mutuals -configuration Debug \
  -destination "platform=iOS Simulator,name=$SIM" build

APP=$(xcodebuild -project Mutuals.xcodeproj -scheme Mutuals -configuration Debug \
  -destination "platform=iOS Simulator,name=$SIM" -showBuildSettings 2>/dev/null \
  | awk -F' = ' '/ BUILT_PRODUCTS_DIR /{d=$2} / FULL_PRODUCT_NAME /{n=$2} END{print d"/"n}')

open -a Simulator
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || true
xcrun simctl install "$SIM" "$APP"
xcrun simctl launch "$SIM" com.joshuawolf.mutuals
echo "==> running"
