#!/bin/bash

# Production OAuth Setup Script for Fly.io + Netlify
# Usage: ./scripts/setup-production-oauth.sh YOUR_NETLIFY_URL

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get Netlify URL from argument or prompt
if [ -z "$1" ]; then
    echo -e "${YELLOW}📝 Ce URL are frontend-ul tău pe Netlify?${NC}"
    echo "Exemple:"
    echo "  - https://slackcrm.netlify.app"
    echo "  - https://my-crm.netlify.app"
    echo "  - https://your-custom-domain.com"
    echo ""
    read -p "Netlify URL: " NETLIFY_URL
else
    NETLIFY_URL=$1
fi

# Remove trailing slash if present
NETLIFY_URL=${NETLIFY_URL%/}

# Validate URL
if [[ ! $NETLIFY_URL =~ ^https?:// ]]; then
    echo -e "${RED}❌ URL invalid! Trebuie să înceapă cu http:// sau https://${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🚀 Configurare Google OAuth pentru Producție${NC}"
echo "=============================================="
echo ""
echo "Backend (Fly.io):  https://slackcrm-backend.fly.dev"
echo "Frontend (Netlify): $NETLIFY_URL"
echo ""

# Confirm
read -p "Continuăm? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Anulat."
    exit 1
fi

echo ""
echo -e "${YELLOW}📦 Step 1: Configurare Fly.io Secrets...${NC}"

# Set all secrets in one command
flyctl secrets set \
  GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="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" \
  GOOGLE_CALLBACK_URL="https://slackcrm-backend.fly.dev/api/v1/auth/google/callback" \
  OAUTH_GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  OAUTH_GOOGLE_CLIENT_SECRET="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" \
  OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly" \
  FRONTEND_URL="$NETLIFY_URL" \
  THROTTLE_TTL=60 \
  THROTTLE_LIMIT=200 \
  -a slackcrm-backend

echo ""
echo -e "${GREEN}✅ Fly.io secrets configurate!${NC}"
echo ""

# Wait for deployment
echo -e "${YELLOW}⏳ Aștept deployment Fly.io...${NC}"
sleep 10

# Check health
echo ""
echo -e "${YELLOW}🏥 Verificare health backend...${NC}"
HEALTH_RESPONSE=$(curl -s https://slackcrm-backend.fly.dev/api/v1/health || echo "FAILED")

if [[ $HEALTH_RESPONSE == *"ok"* ]]; then
    echo -e "${GREEN}✅ Backend OK!${NC}"
else
    echo -e "${RED}⚠️  Backend nu răspunde corect. Verifică logs:${NC}"
    echo "   flyctl logs -a slackcrm-backend"
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ Setup Complet!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${YELLOW}📝 URMĂTORII PAȘI OBLIGATORII:${NC}"
echo ""
echo "1️⃣  Du-te la Google Cloud Console:"
echo "   🔗 https://console.cloud.google.com/apis/credentials"
echo ""
echo "2️⃣  Găsește OAuth Client ID:"
echo "   883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc..."
echo ""
echo "3️⃣  Click 'Edit' și adaugă EXACT aceste redirect URIs:"
echo ""
echo "   📍 https://slackcrm-backend.fly.dev/api/v1/auth/google/callback"
echo "   📍 https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback"
echo "   📍 http://localhost:3000/api/v1/auth/google/callback"
echo "   📍 http://localhost:3000/api/v1/integrations/oauth/callback"
echo ""
echo "4️⃣  Click 'SAVE' ✅"
echo ""
echo "5️⃣  AȘTEAPTĂ 5-10 minute pentru propagare"
echo ""
echo "6️⃣  Configurează Netlify Environment Variables:"
echo "   - Du-te la: https://app.netlify.com"
echo "   - Site settings → Environment variables"
echo "   - Adaugă: NEXT_PUBLIC_API_URL=https://slackcrm-backend.fly.dev/api/v1"
echo "   - Trigger rebuild"
echo ""
echo "7️⃣  Testează:"
echo "   🌐 $NETLIFY_URL/login"
echo "   Click 'Login with Google'"
echo ""
echo -e "${YELLOW}⏰ REMINDER: Așteaptă 5-10 minute după update Google Console!${NC}"
echo ""

# Save config for reference
CONFIG_FILE="production-oauth-config.txt"
cat > $CONFIG_FILE << EOF
Production OAuth Configuration
==============================
Generated: $(date)

Backend URL: https://slackcrm-backend.fly.dev
Frontend URL: $NETLIFY_URL

Google OAuth Client ID: 883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com

Required Redirect URIs in Google Console:
- https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
- https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
- http://localhost:3000/api/v1/auth/google/callback
- http://localhost:3000/api/v1/integrations/oauth/callback

Fly.io Secrets Set:
- GOOGLE_CLIENT_ID ✅
- GOOGLE_CLIENT_SECRET ✅
- GOOGLE_CALLBACK_URL ✅
- OAUTH_GOOGLE_CLIENT_ID ✅
- OAUTH_GOOGLE_CLIENT_SECRET ✅
- OAUTH_GOOGLE_REDIRECT_URI ✅
- OAUTH_GOOGLE_SCOPES ✅
- FRONTEND_URL ✅
- THROTTLE_TTL ✅
- THROTTLE_LIMIT ✅

Netlify Environment Variable Needed:
- NEXT_PUBLIC_API_URL=https://slackcrm-backend.fly.dev/api/v1

Test URLs:
- Health Check: https://slackcrm-backend.fly.dev/api/v1/health
- OAuth Test: https://slackcrm-backend.fly.dev/api/v1/auth/google
- Login Page: $NETLIFY_URL/login
EOF

echo -e "${GREEN}📄 Config salvat în: $CONFIG_FILE${NC}"
echo ""
echo -e "${GREEN}🎉 Gata! Urmează pașii de mai sus și apoi testează!${NC}"
