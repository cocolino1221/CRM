#!/usr/bin/env bash
#
# Local TestFlight build + upload for EasyTeam CRM — NO Expo EAS.
# Archives the prebuilt iOS project with Xcode, re-signs for App Store
# distribution, and uploads straight to App Store Connect via an ASC API key.
#
# Prereqs (already present on this Mac):
#   - Xcode + the "Apple Distribution: … (89HM3ZDZAW)" signing identity
#   - An App Store Connect API key .p8 in ~/.appstoreconnect/private_keys/
#   - Pods installed under ios/ (expo prebuild already run)
#
# Usage:
#   ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=<uuid> ./scripts/testflight.sh
# Optional:
#   BUILD_NUM=YYYYmmddHHMM   (defaults to current timestamp)
#   MARKETING_VERSION=1.1.0  (defaults to app.json expo.version)
#
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEME="EasyTeamCRM"
WORKSPACE="ios/EasyTeamCRM.xcworkspace"
KEY_ID="${ASC_KEY_ID:?Set ASC_KEY_ID (one of the AuthKey_*.p8 file IDs)}"
ISSUER_ID="${ASC_ISSUER_ID:?Set ASC_ISSUER_ID (App Store Connect Issuer ID, a UUID)}"
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
[ -f "$KEY_PATH" ] || { echo "API key not found: $KEY_PATH"; exit 1; }

BUILD_NUM="${BUILD_NUM:-$(date +%Y%m%d%H%M)}"
MARKETING_VERSION="${MARKETING_VERSION:-$(node -p "require('./app.json').expo.version")}"
ARCHIVE="ios/build/EasyTeamCRM-TF-${BUILD_NUM}.xcarchive"
EXPORT_DIR="ios/build/export-${BUILD_NUM}"

AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$KEY_PATH"
  -authenticationKeyID "$KEY_ID"
  -authenticationKeyIssuerID "$ISSUER_ID")

echo "▸ Version $MARKETING_VERSION (build $BUILD_NUM) — archiving…"
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  "${AUTH[@]}" \
  MARKETING_VERSION="$MARKETING_VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUM" \
  archive

echo "▸ Exporting + uploading to TestFlight…"
# ios/UploadOptions.plist has destination=upload → this signs for the App Store
# and pushes the build to App Store Connect in one step.
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/UploadOptions.plist \
  -exportPath "$EXPORT_DIR" \
  "${AUTH[@]}"

echo "✅ Uploaded build $BUILD_NUM. It will appear in App Store Connect → TestFlight after processing (~5–15 min)."
