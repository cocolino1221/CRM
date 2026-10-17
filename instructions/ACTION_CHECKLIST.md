# ✅ Action Checklist - OAuth Integration Setup

## Backend Status: ✅ READY

- ✅ Backend deployed: https://slackcrm-backend.fly.dev
- ✅ Health check passing: `/api/v1/health`
- ✅ Redirect URI fixed: includes `/api/v1` path
- ✅ Rate limiting optimized: 200 requests per 60 seconds
- ✅ All 13 integration handlers registered

## Your Redirect URI (copy this):
```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

---

## 🎯 What You Need To Do Now

### Step 1: Choose Which Integrations You Want

Check which integrations you want to enable for your users:

- [ ] **Google** (Gmail, Calendar, Contacts) - Most common ⭐
- [ ] **Slack** (Workspace integration) - Most common ⭐
- [ ] **Microsoft** (Outlook, Teams, OneDrive)
- [ ] **Calendly** (Appointment scheduling)
- [ ] **Zoom** (Video meetings)
- [ ] **HubSpot** (CRM sync)
- [ ] **Salesforce** (CRM sync)
- [ ] **DocuSign** (Document signing)

**Tip:** Start with just Google and Slack for your launch tomorrow. Add others later.

---

## 📧 Step 2A: Setup Google OAuth (Priority #1)

### 2A.1 - Create OAuth Credentials

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Name: **"SlackCRM Production"**
5. **Authorized redirect URIs** → Click **"+ ADD URI"**:
   ```
   https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```
6. Click **"CREATE"**
7. **COPY** the Client ID and Client Secret (you'll need them in Step 3)

### 2A.2 - Enable Required APIs

Still in Google Cloud Console:
1. Go to: https://console.cloud.google.com/apis/library
2. Enable these APIs:
   - Google Calendar API
   - Gmail API
   - Google People API (Contacts)

---

## 🔮 Step 2B: Setup Slack OAuth (Priority #2)

### 2B.1 - Create Slack App

1. Go to: https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. App Name: **"SlackCRM"**
4. Pick a workspace (your workspace)
5. Click **"Create App"**

### 2B.2 - Configure OAuth

1. In your app, go to **"OAuth & Permissions"** (left sidebar)
2. Under **"Redirect URLs"** → Click **"Add New Redirect URL"**:
   ```
   https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```
3. Click **"Add"** then **"Save URLs"**

### 2B.3 - Add Bot Scopes

Still in "OAuth & Permissions", scroll to **"Scopes"** → **"Bot Token Scopes"** → Add:
- `channels:read`
- `channels:history`
- `chat:write`
- `users:read`
- `users:read.email`

### 2B.4 - Get Credentials

1. Go to **"Basic Information"** (left sidebar)
2. Under **"App Credentials"**:
   - **COPY** "Client ID"
   - **COPY** "Client Secret"

---

## 📅 Step 2C: Setup Calendly OAuth (Optional)

1. Go to: https://calendly.com/integrations/api_webhooks
2. Click **"Get your API Key"** or **"OAuth Setup"**
3. Register your application:
   - Name: **"SlackCRM"**
   - Redirect URI: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
4. **COPY** Client ID and Client Secret

---

## 🔧 Step 3: Set OAuth Secrets on Fly.io

For each integration you set up, run these commands:

### For Google:
```bash
flyctl secrets set \
  OAUTH_GOOGLE_CLIENT_ID="your-client-id-here" \
  OAUTH_GOOGLE_CLIENT_SECRET="your-client-secret-here" \
  OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly" \
  -a slackcrm-backend
```

### For Slack:
```bash
flyctl secrets set \
  OAUTH_SLACK_CLIENT_ID="your-client-id-here" \
  OAUTH_SLACK_CLIENT_SECRET="your-client-secret-here" \
  OAUTH_SLACK_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  OAUTH_SLACK_SCOPES="channels:read,channels:history,chat:write,users:read,users:read.email" \
  -a slackcrm-backend
```

### For Calendly:
```bash
flyctl secrets set \
  OAUTH_CALENDLY_CLIENT_ID="your-client-id-here" \
  OAUTH_CALENDLY_CLIENT_SECRET="your-client-secret-here" \
  OAUTH_CALENDLY_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  OAUTH_CALENDLY_SCOPES="default" \
  -a slackcrm-backend
```

**Note:** Replace `your-client-id-here` and `your-client-secret-here` with the actual values you copied in Step 2.

---

## ✅ Step 4: Test OAuth Flow

### 4.1 - Test from your CRM Frontend

1. Open your CRM: https://your-crm-frontend.netlify.app
2. Go to **Integrations** page
3. Click **"Connect"** on Google (or Slack)
4. You should be redirected to Google/Slack login
5. **Authorize** the app
6. You should return to CRM with **"Connected"** status ✅

### 4.2 - If You Get Error

**Error: "redirect_uri_mismatch"**
- Double-check the redirect URI in OAuth console matches EXACTLY:
  ```
  https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
  ```
- No trailing slash, must include `/api/v1`

**Error: "invalid_client"**
- Check Client ID and Client Secret are set correctly on Fly.io
- Run: `flyctl secrets list -a slackcrm-backend`
- Verify `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET` are listed

**Error: HTTP 429**
- Already fixed! If you still see this, run:
  ```bash
  flyctl secrets set THROTTLE_LIMIT=200 -a slackcrm-backend
  ```

---

## 🚀 Step 5: Deploy Frontend (if not already)

Make sure your frontend is pointing to the correct backend:

```bash
# In frontend/.env or Netlify env variables
NEXT_PUBLIC_API_URL=https://slackcrm-backend.fly.dev
```

Deploy:
```bash
cd frontend
netlify deploy --prod
```

---

## 📋 Quick Verification Commands

### Check backend is live:
```bash
curl https://slackcrm-backend.fly.dev/api/v1/health
```
Should return: `{"status":"ok","timestamp":"...","service":"SlackCRM API","version":"1.0.0"}`

### Check which secrets are set:
```bash
flyctl secrets list -a slackcrm-backend
```
Look for `OAUTH_*` entries

### Check backend logs:
```bash
flyctl logs -a slackcrm-backend
```
Look for OAuth-related messages

---

## 🎯 Launch Checklist

Before launching tomorrow:

- [ ] Choose which integrations to enable (at minimum: Google + Slack)
- [ ] Create OAuth apps in provider consoles (Google, Slack)
- [ ] Set OAuth secrets on Fly.io
- [ ] Test OAuth flow from frontend
- [ ] Verify "Connected" status appears in CRM
- [ ] Test disconnecting and reconnecting
- [ ] Update documentation for end users on which integrations are available

---

## 📞 Need Help?

### Check these docs:
- **FIX_NOW.md** - Quick fix guide with exact steps
- **SETUP_OAUTH_INTEGRATIONS.md** - Detailed setup for all providers
- **VERIFY_FIX.md** - How to verify everything works

### Debug commands:
```bash
# Test health
curl https://slackcrm-backend.fly.dev/api/v1/health

# List secrets
flyctl secrets list -a slackcrm-backend

# Watch logs
flyctl logs -a slackcrm-backend

# Check app status
flyctl status -a slackcrm-backend
```

---

**🎉 Once you complete Steps 1-4, your integrations will be ready for end users to connect with their personal accounts! 🎉**

**Time estimate:** 15-20 minutes for Google + Slack setup
