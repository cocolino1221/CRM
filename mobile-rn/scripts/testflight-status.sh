#!/usr/bin/env bash
#
# Wait for App Store Connect to finish processing a build.
#
# Lives here rather than in /tmp, where the previous copy — and the export
# options plist beside it — were swept between two builds. The export then
# failed with "no such file", which says nothing about what the file was for.
#
#   ./scripts/testflight-status.sh 202610181435

set -euo pipefail

TARGET="${1:?usage: testflight-status.sh <buildNumber>}"
KEY_ID="${ASC_KEY_ID:-2U26WL456L}"
ISSUER="${ASC_ISSUER_ID:?set ASC_ISSUER_ID}"
APP_ID="${ASC_APP_ID:-6759438859}"
ATTEMPTS="${ATTEMPTS:-30}"

token() {
  python3 - "$KEY_ID" "$ISSUER" <<'PY'
import sys, time, pathlib, jwt
key_id, issuer = sys.argv[1], sys.argv[2]
key = pathlib.Path.home().joinpath(".appstoreconnect/private_keys", f"AuthKey_{key_id}.p8").read_text()
print(jwt.encode({"iss": issuer, "iat": int(time.time()), "exp": int(time.time()) + 600,
                  "aud": "appstoreconnect-v1"},
                 key, algorithm="ES256", headers={"kid": key_id, "typ": "JWT"}))
PY
}

for i in $(seq 1 "$ATTEMPTS"); do
  state=$(curl -s -H "Authorization: Bearer $(token)" \
    "https://api.appstoreconnect.apple.com/v1/builds?filter%5Bapp%5D=${APP_ID}&filter%5Bversion%5D=${TARGET}" \
    | python3 -c "
import json,sys
rows = json.load(sys.stdin).get('data', [])
print(rows[0]['attributes'].get('processingState') if rows else 'ABSENT')
")

  case "$state" in
    VALID)   echo "✓ $TARGET is VALID after $((i*30))s"; exit 0 ;;
    INVALID|FAILED) echo "✗ $TARGET came back $state"; exit 1 ;;
    *)       echo "… $TARGET: $state"; sleep 30 ;;
  esac
done

echo "timed out after $((ATTEMPTS*30))s; last state: ${state:-unknown}"
exit 1
