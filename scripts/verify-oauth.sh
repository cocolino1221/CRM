#!/bin/bash

# OAuth Configuration Verification Script
# This script checks if all OAuth integrations are properly configured

echo "🔍 OAuth Configuration Verification"
echo "===================================="
echo ""

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment variables
if [ -f "$PROJECT_ROOT/backend/.env" ]; then
    export $(cat "$PROJECT_ROOT/backend/.env" | grep -v '^#' | xargs)
    echo "✅ Loaded .env file from $PROJECT_ROOT/backend/.env"
else
    echo "❌ .env file not found at $PROJECT_ROOT/backend/.env"
    exit 1
fi

echo ""
echo "📋 User Authentication OAuth (Login)"
echo "------------------------------------"

# Check Google Login OAuth
if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ] && [ -n "$GOOGLE_CALLBACK_URL" ]; then
    echo "✅ Google Login OAuth: Configured"
    echo "   Client ID: ${GOOGLE_CLIENT_ID:0:20}..."
    echo "   Callback: $GOOGLE_CALLBACK_URL"
else
    echo "❌ Google Login OAuth: Missing credentials"
    [ -z "$GOOGLE_CLIENT_ID" ] && echo "   Missing: GOOGLE_CLIENT_ID"
    [ -z "$GOOGLE_CLIENT_SECRET" ] && echo "   Missing: GOOGLE_CLIENT_SECRET"
    [ -z "$GOOGLE_CALLBACK_URL" ] && echo "   Missing: GOOGLE_CALLBACK_URL"
fi

# Check Slack Login OAuth
if [ -n "$SLACK_CLIENT_ID" ] && [ -n "$SLACK_CLIENT_SECRET" ]; then
    echo "✅ Slack Login OAuth: Configured"
    echo "   Client ID: ${SLACK_CLIENT_ID:0:20}..."
else
    echo "⚠️  Slack Login OAuth: Not configured (optional)"
fi

echo ""
echo "🔌 Integration OAuth"
echo "------------------------------------"

# Check Google Integration OAuth
if [ -n "$OAUTH_GOOGLE_CLIENT_ID" ] && [ -n "$OAUTH_GOOGLE_CLIENT_SECRET" ] && [ -n "$OAUTH_GOOGLE_REDIRECT_URI" ]; then
    echo "✅ Google Integration: Configured"
    echo "   Client ID: ${OAUTH_GOOGLE_CLIENT_ID:0:20}..."
    echo "   Redirect URI: $OAUTH_GOOGLE_REDIRECT_URI"
    echo "   Scopes: ${OAUTH_GOOGLE_SCOPES:0:50}..."
else
    echo "❌ Google Integration: Missing credentials"
    [ -z "$OAUTH_GOOGLE_CLIENT_ID" ] && echo "   Missing: OAUTH_GOOGLE_CLIENT_ID"
    [ -z "$OAUTH_GOOGLE_CLIENT_SECRET" ] && echo "   Missing: OAUTH_GOOGLE_CLIENT_SECRET"
    [ -z "$OAUTH_GOOGLE_REDIRECT_URI" ] && echo "   Missing: OAUTH_GOOGLE_REDIRECT_URI"
fi

# Check Slack Integration OAuth
if [ -n "$OAUTH_SLACK_CLIENT_ID" ] && [ -n "$OAUTH_SLACK_CLIENT_SECRET" ] && [ -n "$OAUTH_SLACK_REDIRECT_URI" ]; then
    echo "✅ Slack Integration: Configured"
    echo "   Client ID: ${OAUTH_SLACK_CLIENT_ID:0:20}..."
    echo "   Redirect URI: $OAUTH_SLACK_REDIRECT_URI"
else
    echo "⚠️  Slack Integration: Not configured"
    if [ "$OAUTH_SLACK_CLIENT_ID" = "your-slack-client-id" ]; then
        echo "   Note: Using placeholder values"
    fi
fi

# Check Microsoft Integration OAuth
if [ -n "$OAUTH_MICROSOFT_CLIENT_ID" ] && [ -n "$OAUTH_MICROSOFT_CLIENT_SECRET" ] && [ -n "$OAUTH_MICROSOFT_REDIRECT_URI" ]; then
    echo "✅ Microsoft Integration: Configured"
    echo "   Client ID: ${OAUTH_MICROSOFT_CLIENT_ID:0:20}..."
    echo "   Redirect URI: $OAUTH_MICROSOFT_REDIRECT_URI"
else
    echo "⚠️  Microsoft Integration: Not configured"
    if [ "$OAUTH_MICROSOFT_CLIENT_ID" = "your-microsoft-client-id" ]; then
        echo "   Note: Using placeholder values"
    fi
fi

# Check Salesforce Integration OAuth
if [ -n "$OAUTH_SALESFORCE_CLIENT_ID" ] && [ -n "$OAUTH_SALESFORCE_CLIENT_SECRET" ] && [ -n "$OAUTH_SALESFORCE_REDIRECT_URI" ]; then
    echo "✅ Salesforce Integration: Configured"
    echo "   Client ID: ${OAUTH_SALESFORCE_CLIENT_ID:0:20}..."
    echo "   Redirect URI: $OAUTH_SALESFORCE_REDIRECT_URI"
else
    echo "⚠️  Salesforce Integration: Not configured"
    if [ "$OAUTH_SALESFORCE_CLIENT_ID" = "your-salesforce-client-id" ]; then
        echo "   Note: Using placeholder values"
    fi
fi

# Check Zoom Integration OAuth
if [ -n "$OAUTH_ZOOM_CLIENT_ID" ] && [ -n "$OAUTH_ZOOM_CLIENT_SECRET" ] && [ -n "$OAUTH_ZOOM_REDIRECT_URI" ]; then
    echo "✅ Zoom Integration: Configured"
    echo "   Client ID: ${OAUTH_ZOOM_CLIENT_ID:0:20}..."
    echo "   Redirect URI: $OAUTH_ZOOM_REDIRECT_URI"
else
    echo "⚠️  Zoom Integration: Not configured"
    if [ "$OAUTH_ZOOM_CLIENT_ID" = "your-zoom-client-id" ]; then
        echo "   Note: Using placeholder values"
    fi
fi

# Check HubSpot Integration OAuth
if [ -n "$OAUTH_HUBSPOT_CLIENT_ID" ] && [ -n "$OAUTH_HUBSPOT_CLIENT_SECRET" ] && [ -n "$OAUTH_HUBSPOT_REDIRECT_URI" ]; then
    echo "✅ HubSpot Integration: Configured"
    echo "   Client ID: ${OAUTH_HUBSPOT_CLIENT_ID:0:20}..."
    echo "   Redirect URI: $OAUTH_HUBSPOT_REDIRECT_URI"
else
    echo "⚠️  HubSpot Integration: Not configured"
    if [ "$OAUTH_HUBSPOT_CLIENT_ID" = "your-hubspot-client-id" ]; then
        echo "   Note: Using placeholder values"
    fi
fi

echo ""
echo "🌐 URL Configuration"
echo "------------------------------------"
echo "Frontend URL: $FRONTEND_URL"
echo "Backend/App URL: $APP_URL"

echo ""
echo "📝 Required Google Cloud Console Redirect URIs"
echo "------------------------------------"
echo "For user login and integrations, add these to Google Console:"
echo ""
echo "Local Development:"
echo "  - http://localhost:3000/api/v1/auth/google/callback"
echo "  - http://localhost:3000/api/v1/integrations/oauth/callback"
echo ""
echo "Production (Fly.io):"
echo "  - https://slackcrm-backend.fly.dev/api/v1/auth/google/callback"
echo "  - https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback"
echo ""

echo "✨ Verification complete!"
echo ""
echo "Next steps:"
echo "1. Go to https://console.cloud.google.com/apis/credentials"
echo "2. Add the redirect URIs listed above"
echo "3. Restart your backend server"
echo "4. Test login at http://localhost:3001/login"
