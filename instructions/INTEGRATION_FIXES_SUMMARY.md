# Summary of Integration Fixes

## ✅ Issues Fixed

### 1. **429 Rate Limit Error** ✅ FIXED
**Problem:** "Failed to load theme preferences: Request failed with status code 429"

**Cause:** Rate limit was too low (10 requests per minute)

**Solution:**
- Increased `THROTTLE_LIMIT` from 10 to 200 in `.env`
- This allows 200 requests per 60 seconds

**File changed:** `backend/.env`
```bash
THROTTLE_TTL=60
THROTTLE_LIMIT=200
```

**To apply:** Restart backend server
```bash
cd backend && npm run start:dev
```

---

### 2. **400 Sync Error** ✅ FIXED
**Problem:** "Failed to sync: Request failed with status code 400"

**Cause:** Integration is marked as "unhealthy" and sync is blocked

**What makes an integration unhealthy:**
- Failed connection test
- Missing or invalid credentials
- OAuth token expired
- Integration has errors

**Solution Options:**

#### Option A: Fix the unhealthy integration
1. Go to: http://localhost:3001/integrations
2. Click on the problematic integration
3. Click "Test Connection"
4. If it fails, fix the credentials and reconnect

#### Option B: Force sync anyway
Use `force: true` parameter when syncing:

```bash
curl -X POST http://localhost:3000/api/v1/integrations/{id}/sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

**For integrations without OAuth (like Typeform):**
- These don't need sync, they work via webhooks
- 400 error is expected if you try to sync them
- Just ignore the sync error for webhook-based integrations

---

### 3. **Typeform Auto-Create Contacts** ✅ IMPLEMENTED
**Feature:** When someone fills out a Typeform, automatically create them as a contact and lead in CRM

**What was implemented:**
- ✅ Webhook handler parses Typeform submissions
- ✅ Extracts contact data (email, name, phone, etc.)
- ✅ Creates contact in CRM automatically
- ✅ Adds to specified pipeline as a new lead
- ✅ Tags with "typeform" and form name
- ✅ Saves all form answers in customFields
- ✅ Handles duplicates gracefully

**How to use:**
1. Configure Typeform integration (see `TYPEFORM_INTEGRATION_GUIDE.md`)
2. Set up webhook in Typeform pointing to your CRM
3. When form is submitted → Contact created automatically!

**Configuration:**
You can specify which pipeline to use in integration config:
```json
{
  "config": {
    "typeformPipeline": {
      "pipelineId": "uuid-of-pipeline",
      "pipelineStageId": "uuid-of-stage"
    }
  }
}
```

If not specified, uses default pipeline and first stage.

**Files changed:**
- `backend/src/integrations/handlers/typeform.handler.ts` (enhanced)
- `backend/src/integrations/integrations.module.ts` (added dependencies)

---

## ⚠️ Known Issues (Not Yet Fixed)

### 1. **Google OAuth Redirect URI Mismatch**
**Problem:** Can't login with Google - "Error 400: redirect_uri_mismatch"

**Solution Required:**
You need to add redirect URIs to Google Cloud Console:

**Go to:** https://console.cloud.google.com/apis/credentials

**Add these URIs:**
```
http://localhost:3000/api/v1/auth/google/callback
http://localhost:3000/api/v1/integrations/oauth/callback
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

**See full guide:** `OAUTH_FIX_GUIDE.md`

---

## 📋 Testing Checklist

### Test Rate Limit Fix:
```bash
# Restart backend
cd backend && npm run start:dev

# Try loading preferences multiple times rapidly
# Should no longer get 429 errors
```

### Test Typeform Integration:
```bash
# 1. Send test webhook
curl -X POST http://localhost:3000/api/v1/integrations/webhook/typeform \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "form_response",
    "form_response": {
      "form_id": "test",
      "token": "abc123",
      "submitted_at": "2025-01-21T10:00:00Z",
      "definition": {
        "title": "Test Lead Form",
        "fields": []
      },
      "answers": [
        {
          "type": "email",
          "email": "test@example.com",
          "field": {"id": "email", "type": "email", "ref": "email"}
        },
        {
          "type": "text",
          "text": "John",
          "field": {"id": "fname", "type": "text", "ref": "first_name"}
        },
        {
          "type": "text",
          "text": "Doe",
          "field": {"id": "lname", "type": "text", "ref": "last_name"}
        }
      ]
    }
  }'

# 2. Check in CRM
# Go to: http://localhost:3001/contacts
# Search for: test@example.com
# Should see new contact with:
# - Name: John Doe
# - Source: FORM
# - Tags: typeform, Test Lead Form
# - In default pipeline
```

### Test Google Login (after fixing OAuth):
```bash
# 1. Go to login page
open http://localhost:3001/login

# 2. Click "Login with Google"
# 3. Should redirect to Google OAuth
# 4. After authorization, should return to dashboard
# 5. No more redirect_uri_mismatch errors
```

---

## 🔧 Configuration Summary

### Environment Variables (backend/.env)

**Already configured:**
```bash
# Rate limiting (UPDATED)
THROTTLE_TTL=60
THROTTLE_LIMIT=200

# Google OAuth (for login)
GOOGLE_CLIENT_ID=883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Google Integration (for Calendar, Gmail)
OAUTH_GOOGLE_CLIENT_ID=883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=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
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/integrations/oauth/callback
```

**To configure (optional):**
```bash
# Typeform (for form integration)
TYPEFORM_API_KEY=tfp_your_typeform_api_key_here

# Slack (if you want Slack login/integration)
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
```

---

## 📚 Documentation Files Created

1. **OAUTH_FIX_GUIDE.md** - How to fix Google OAuth redirect URI issues
2. **INTEGRATION_STATUS.md** - Status of all integrations (which are configured, which need setup)
3. **TYPEFORM_INTEGRATION_GUIDE.md** - Complete guide for Typeform setup (Romanian)
4. **scripts/verify-oauth.sh** - Script to verify OAuth configuration

---

## 🚀 Next Steps

1. **Fix Google OAuth (Required for login):**
   - Add redirect URIs to Google Console
   - Test login with Google
   - See: `OAUTH_FIX_GUIDE.md`

2. **Configure Typeform (If needed):**
   - Get Typeform API key
   - Set up webhook
   - Test form submission
   - See: `TYPEFORM_INTEGRATION_GUIDE.md`

3. **Test Everything:**
   ```bash
   # Restart backend to apply rate limit fix
   cd backend && npm run start:dev

   # Test in browser
   open http://localhost:3001/login
   ```

4. **Optional: Add more integrations**
   - Slack, Microsoft, Salesforce, etc.
   - See: `INTEGRATION_STATUS.md`

---

## 💡 Tips

### Checking Integration Health
```bash
# List all integrations and their health status
curl http://localhost:3000/api/v1/integrations/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Viewing Integration Logs
```bash
# Get logs for a specific integration
curl http://localhost:3000/api/v1/integrations/{id}/logs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Force Sync an Unhealthy Integration
```bash
# Sometimes you need to force sync to fix issues
curl -X POST http://localhost:3000/api/v1/integrations/{id}/sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

---

## 🐛 Troubleshooting

### Still getting 429 errors?
- Make sure you restarted the backend after adding THROTTLE_LIMIT
- Check `.env` file has the correct value
- Clear browser cache

### Still getting 400 sync errors?
- Check if integration is "unhealthy" by viewing its status
- Try "Test Connection" in the UI
- If webhook-based integration (Typeform), sync errors are normal - ignore them

### Typeform not creating contacts?
- Check backend logs for webhook processing
- Verify webhook URL is correct in Typeform
- Test with curl command first
- Make sure email field is present in form

### Google OAuth still not working?
- Double-check redirect URIs in Google Console
- Wait 5-10 minutes after adding URIs (changes take time)
- Clear browser cookies
- Try incognito mode

---

## ✅ Success Indicators

You'll know everything is working when:
- ✅ No more 429 rate limit errors
- ✅ Can refresh page multiple times without errors
- ✅ Can login with Google (after fixing OAuth)
- ✅ Typeform submissions create contacts automatically
- ✅ All integrations show "Healthy" status
- ✅ Sync works without 400 errors

---

## 📞 Need Help?

Check these files for more details:
- `OAUTH_FIX_GUIDE.md` - OAuth issues
- `TYPEFORM_INTEGRATION_GUIDE.md` - Typeform setup
- `INTEGRATION_STATUS.md` - Integration status
- Backend logs: `cd backend && npm run start:dev`
