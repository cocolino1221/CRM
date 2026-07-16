#!/usr/bin/env bash
#
# Local signed APK build for EasyTeam CRM — no Expo EAS.
# Uses the existing release keystore (android/app/upload-keystore.jks via
# android/key.properties). Output lands in dist/ with a versioned name.
#
# Usage:  ./scripts/apk.sh
# Optional: BUILD_NUM=YYYYmmddHHMM (defaults to timestamp; also used as versionCode date tag)
#
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_NUM="${BUILD_NUM:-$(date +%Y%m%d%H%M)}"
MARKETING_VERSION="$(node -p "require('./app.json').expo.version")"

echo "▸ Building signed release APK — v${MARKETING_VERSION} (${BUILD_NUM})…"
cd android
./gradlew assembleRelease --console=plain -q

cd ..
mkdir -p dist
SRC="android/app/build/outputs/apk/release/app-release.apk"
[ -f "$SRC" ] || { echo "APK not found at $SRC"; exit 1; }
OUT="dist/EasyTeamCRM-${MARKETING_VERSION}-${BUILD_NUM}.apk"
cp "$SRC" "$OUT"

echo "✅ APK ready: $OUT"
du -h "$OUT" | cut -f1 | xargs echo "   size:"
