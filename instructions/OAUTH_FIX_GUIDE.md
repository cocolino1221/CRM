# OAuth Redirect URI Fix Guide

## Problem
You're getting "Error 400: redirect_uri_mismatch" because your Google OAuth redirect URIs aren't properly configured.

## Root Cause
Your application has **TWO separate OAuth systems**:
1. **User Authentication** (for login via Google/Slack)
2. **Integration OAuth** (for connecting Google Calendar, Gmail, etc.)

Each system uses different redirect URIs that must be whitelisted in Google Cloud Console.

## Required Redirect URIs

### For Local Development (localhost)
Add BOTH of these to your Google Cloud Console:
- `http://localhost:3000/api/v1/auth/google/callback` (for login)
- `http://localhost:3000/api/v1/integrations/oauth/callback` (for integrations)

### For Production (Fly.io)
Add BOTH of these to your Google Cloud Console:
- `https://slackcrm-backend.fly.dev/api/v1/auth/google/callback` (for login)
- `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback` (for integrations)

## Step-by-Step Fix

### 1. Update Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Click Edit
4. Under "Authorized redirect URIs", add ALL these URLs:
   ```
   http://localhost:3000/api/v1/auth/google/callback
   http://localhost:3000/api/v1/integrations/oauth/callback
   https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
   https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```
5. Click "Save"

### 2. Verify Environment Variables

Check your `.env` file has the correct values:

```bash
# User Authentication OAuth (for login)
GOOGLE_CLIENT_ID=883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Integration OAuth (for Google Calendar, Gmail, etc.)
OAUTH_GOOGLE_CLIENT_ID=883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=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
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/integrations/oauth/callback
OAUTH_GOOGLE_SCOPES=https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly
```

### 3. For Production Deployment

Update your Fly.io secrets:

```bash
flyctl secrets set \
  GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="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" \
  GOOGLE_CALLBACK_URL="https://slackcrm-backend.fly.dev/api/v1/auth/google/callback" \
  OAUTH_GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  OAUTH_GOOGLE_CLIENT_SECRET="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" \
  OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  -a slackcrm-backend
```

## Understanding the Two OAuth Systems

### System 1: User Authentication (Login)
**URL Flow:**
1. Frontend: User clicks "Login with Google"
2. Redirects to: `/auth/google`
3. Google OAuth: User authorizes
4. Callback to: `/auth/google/callback`
5. Redirects to frontend: `/auth/callback?token=...`

**Purpose:** Authenticate users to access the CRM application

### System 2: Integration OAuth (Integrations)
**URL Flow:**
1. Frontend: User clicks "Connect" on Google integration
2. Redirects to: `/integrations/oauth/authorize?type=google`
3. Google OAuth: User authorizes scopes (Calendar, Gmail, etc.)
4. Callback to: `/integrations/oauth/callback`
5. Stores credentials in Integration entity

**Purpose:** Connect third-party services (Google Calendar, Gmail, Contacts) to the CRM

## Testing After Fix

### Test User Login
1. Go to: http://localhost:3001/login
2. Click "Login with Google"
3. Should redirect to Google OAuth
4. After authorization, should return to dashboard

### Test Integration
1. Go to: http://localhost:3001/integrations
2. Find Google integration
3. Click "Connect"
4. Should redirect to Google OAuth
5. After authorization, integration should show as "Connected"

## Common Issues

### Issue: Still getting redirect_uri_mismatch
**Solution:**
- Clear browser cache
- Wait 5 minutes after updating Google Console (changes can take time)
- Double-check all URLs match exactly (including http vs https)

### Issue: Frontend not receiving callback
**Solution:**
- Check `FRONTEND_URL` in backend .env is correct
- Verify frontend is running on the expected port

### Issue: Integration shows "OAuth credentials not configured"
**Solution:**
- Ensure `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET` are set
- Restart backend after changing .env

## Current Configuration Status

✅ **Backend Routes Configured:**
- User Auth: `/auth/google` and `/auth/google/callback`
- Integration OAuth: `/integrations/oauth/authorize` and `/integrations/oauth/callback`

✅ **Frontend Configured:**
- Login buttons point to correct backend URLs
- OAuth callback handler at `/auth/callback`

⚠️ **Needs Verification:**
- Google Cloud Console redirect URIs
- Slack OAuth configuration (if using Slack login)

## Next Steps

1. Update Google Cloud Console with redirect URIs
2. Restart your backend server
3. Test login with Google
4. Test Google integration connection
5. If using Slack, repeat similar steps for Slack OAuth
