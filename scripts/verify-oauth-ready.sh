#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  SlackCRM OAuth Integration Checker${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check backend health
echo -e "${YELLOW}Checking backend health...${NC}"
HEALTH_RESPONSE=$(curl -s https://slackcrm-backend.fly.dev/api/v1/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    exit 1
fi

echo ""

# Check Fly.io secrets
echo -e "${YELLOW}Checking configured OAuth integrations on Fly.io...${NC}\n"

# Get secrets list
SECRETS=$(flyctl secrets list -a slackcrm-backend 2>/dev/null)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to fetch secrets from Fly.io${NC}"
    echo -e "${YELLOW}Make sure you're logged in: flyctl auth login${NC}"
    exit 1
fi

# Check each integration
check_integration() {
    local name=$1
    local prefix=$2

    if echo "$SECRETS" | grep -q "OAUTH_${prefix}_CLIENT_ID" && \
       echo "$SECRETS" | grep -q "OAUTH_${prefix}_CLIENT_SECRET"; then
        echo -e "${GREEN}✅ $name${NC} - Client ID and Secret configured"
        return 0
    else
        echo -e "${RED}❌ $name${NC} - Missing credentials"
        return 1
    fi
}

CONFIGURED_COUNT=0

# Check all OAuth integrations
if check_integration "Google" "GOOGLE"; then ((CONFIGURED_COUNT++)); fi
if check_integration "Slack" "SLACK"; then ((CONFIGURED_COUNT++)); fi
if check_integration "Microsoft" "MICROSOFT"; then ((CONFIGURED_COUNT++)); fi
if check_integration "HubSpot" "HUBSPOT"; then ((CONFIGURED_COUNT++)); fi
if check_integration "Salesforce" "SALESFORCE"; then ((CONFIGURED_COUNT++)); fi
if check_integration "Zoom" "ZOOM"; then ((CONFIGURED_COUNT++)); fi
if check_integration "DocuSign" "DOCUSIGN"; then ((CONFIGURED_COUNT++)); fi
if check_integration "Calendly" "CALENDLY"; then ((CONFIGURED_COUNT++)); fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary: $CONFIGURED_COUNT/8 integrations configured${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check critical environment variables
echo -e "${YELLOW}Checking critical environment variables...${NC}\n"

if echo "$SECRETS" | grep -q "APP_URL"; then
    echo -e "${GREEN}✅ APP_URL${NC} is set"
else
    echo -e "${RED}❌ APP_URL${NC} is not set"
fi

if echo "$SECRETS" | grep -q "THROTTLE_LIMIT"; then
    echo -e "${GREEN}✅ THROTTLE_LIMIT${NC} is set"
else
    echo -e "${YELLOW}⚠️  THROTTLE_LIMIT${NC} is not set (will use default: 100)"
fi

echo ""

# Show redirect URI info
echo -e "${YELLOW}Your redirect URI (for OAuth consoles):${NC}"
echo -e "${GREEN}https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback${NC}\n"

# Show next steps
if [ $CONFIGURED_COUNT -eq 0 ]; then
    echo -e "${RED}⚠️  No OAuth integrations configured yet${NC}"
    echo -e "${YELLOW}Next step: Follow ACTION_CHECKLIST.md to set up your first integration${NC}"
elif [ $CONFIGURED_COUNT -lt 2 ]; then
    echo -e "${YELLOW}💡 Tip: For launch tomorrow, configure at least Google and Slack${NC}"
    echo -e "${YELLOW}Follow: ACTION_CHECKLIST.md${NC}"
else
    echo -e "${GREEN}🎉 Great! You have $CONFIGURED_COUNT integrations configured${NC}"
    echo -e "${GREEN}Ready to test OAuth flow from your frontend${NC}"
fi

echo ""
