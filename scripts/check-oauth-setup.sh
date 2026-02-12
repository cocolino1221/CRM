#!/bin/bash

# Script pentru verificarea configurării OAuth pe Fly.io
# Usage: ./check-oauth-setup.sh

echo "🔍 Verificare Configurare OAuth pe Fly.io..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

APP_NAME="slackcrm-backend"

# Culori
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funcție pentru verificare secret
check_secret() {
    local secret_name=$1
    if flyctl secrets list -a $APP_NAME 2>/dev/null | grep -q "^$secret_name"; then
        echo -e "${GREEN}✓${NC} $secret_name"
        return 0
    else
        echo -e "${RED}✗${NC} $secret_name ${YELLOW}(LIPSEȘTE)${NC}"
        return 1
    fi
}

# Counter pentru secrete setate
total=0
set_count=0

echo "📧 GOOGLE WORKSPACE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_GOOGLE_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_GOOGLE_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_GOOGLE_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_GOOGLE_SCOPES" && ((set_count+=1))
echo ""

echo "🔮 SLACK:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=3))
check_secret "OAUTH_SLACK_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_SLACK_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_SLACK_REDIRECT_URI" && ((set_count+=1))
echo ""

echo "👥 MICROSOFT 365:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_MICROSOFT_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_MICROSOFT_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_MICROSOFT_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_MICROSOFT_SCOPES" && ((set_count+=1))
echo ""

echo "🧡 HUBSPOT:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_HUBSPOT_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_HUBSPOT_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_HUBSPOT_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_HUBSPOT_SCOPES" && ((set_count+=1))
echo ""

echo "☁️ SALESFORCE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_SALESFORCE_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_SALESFORCE_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_SALESFORCE_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_SALESFORCE_SCOPES" && ((set_count+=1))
echo ""

echo "🎥 ZOOM:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_ZOOM_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_ZOOM_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_ZOOM_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_ZOOM_SCOPES" && ((set_count+=1))
echo ""

echo "✍️ DOCUSIGN:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_DOCUSIGN_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_DOCUSIGN_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_DOCUSIGN_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_DOCUSIGN_SCOPES" && ((set_count+=1))
echo ""

echo "📅 CALENDLY:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((total+=4))
check_secret "OAUTH_CALENDLY_CLIENT_ID" && ((set_count+=1))
check_secret "OAUTH_CALENDLY_CLIENT_SECRET" && ((set_count+=1))
check_secret "OAUTH_CALENDLY_REDIRECT_URI" && ((set_count+=1))
check_secret "OAUTH_CALENDLY_SCOPES" && ((set_count+=1))
echo ""

# Rezumat
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 REZUMAT:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
percentage=$((set_count * 100 / total))

if [ $set_count -eq $total ]; then
    echo -e "${GREEN}✓ TOATE SECRETELE SUNT SETATE!${NC} ($set_count/$total)"
    echo ""
    echo "🎉 Integrările sunt gata!"
    echo "🚀 Poți testa conectarea din frontend."
elif [ $set_count -gt 0 ]; then
    echo -e "${YELLOW}⚠ PARȚIAL CONFIGURAT${NC} ($set_count/$total - $percentage%)"
    echo ""
    echo "📝 Continuă să adaugi credențialele pentru celelalte integrări."
    echo "📖 Vezi SETUP_OAUTH_INTEGRATIONS.md pentru instrucțiuni."
else
    echo -e "${RED}✗ NICIO INTEGRARE CONFIGURATĂ${NC} (0/$total)"
    echo ""
    echo "📖 Vezi SETUP_OAUTH_INTEGRATIONS.md pentru a începe."
    echo "💡 Recomandare: Începe cu Google, Slack și Calendly."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 COMENZI UTILE:"
echo "  • Vezi toate secretele: flyctl secrets list -a $APP_NAME"
echo "  • Restart backend: flyctl restart -a $APP_NAME"
echo "  • Vezi logs: flyctl logs -a $APP_NAME"
echo ""
