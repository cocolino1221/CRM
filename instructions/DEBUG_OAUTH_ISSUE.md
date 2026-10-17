# 🔍 Debug OAuth "Unsupported Provider" Issue

## Current Status

✅ **Backend Deployed**: https://slackcrm-backend.fly.dev/api/v1/health
✅ **OAuth Providers Fixed**: Added `calendly` to backend typeMap
✅ **Frontend Config**: Netlify has correct `NEXT_PUBLIC_API_URL`
❌ **Issue**: User still getting "Unsupported OAuth provider" for ALL integrations

---

## 🧪 Step-by-Step Debug Process

### Step 1: Verify You're Using Production Backend

Open browser console (F12) on https://easyteamcrm.netlify.app/integrations and run:

```javascript
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1');
```

**Expected**: Should show `https://slackcrm-backend.fly.dev/api/v1`
**If shows localhost**: Clear cache and hard reload (Ctrl+Shift+R / Cmd+Shift+R)

---

### Step 2: Check Your Authentication Status

Run this in browser console (F12):

```javascript
const checkAuth = async () => {
  const apiUrl = 'https://slackcrm-backend.fly.dev/api/v1';
  const token = localStorage.getItem('accessToken');

  console.log('1. Token exists?', !!token);

  if (!token) {
    console.error('❌ NO TOKEN - Please login');
    return;
  }

  console.log('2. Token preview:', token.substring(0, 20) + '...');

  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('3. Response status:', response.status);

    if (!response.ok) {
      console.error('❌ AUTH FAILED - Token invalid or expired');
      console.error('Please logout and login again');
      return;
    }

    const userData = await response.json();
    console.log('4. User data:', userData);

    if (!userData.id) {
      console.error('❌ NO USER ID');
      return;
    }

    if (!userData.workspaceId) {
      console.error('❌ NO WORKSPACE ID - This is the problem!');
      console.error('Solution: Logout and login again to create workspace');
      return;
    }

    console.log('✅ Authentication OK');
    console.log('   User ID:', userData.id);
    console.log('   Workspace ID:', userData.workspaceId);
    console.log('   Email:', userData.email);

    return userData;
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
};

checkAuth();
```

**Common Issues**:
- ❌ `NO TOKEN`: You're not logged in → Go to /login
- ❌ `AUTH FAILED` (401): Token expired → Logout and login again
- ❌ `NO WORKSPACE ID`: Account created before workspace system → **Logout and login again**

---

### Step 3: Test OAuth URL Construction

After confirming auth works (Step 2), test OAuth URL:

```javascript
const testOAuth = async () => {
  const apiUrl = 'https://slackcrm-backend.fly.dev/api/v1';
  const token = localStorage.getItem('accessToken');

  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const userData = await response.json();
  const { id: userId, workspaceId } = userData;

  // Test each provider
  const providers = ['google', 'slack', 'calendly'];

  providers.forEach(provider => {
    const oauthUrl = `${apiUrl}/integrations/oauth/${provider}?workspace_id=${workspaceId}&user_id=${userId}`;
    console.log(`\n${provider} OAuth URL:`, oauthUrl);
  });

  // Test if backend accepts the URL
  const testProvider = 'google';
  const testUrl = `${apiUrl}/integrations/oauth/${testProvider}?workspace_id=${workspaceId}&user_id=${userId}`;

  console.log('\n🧪 Testing OAuth endpoint (will redirect)...');
  console.log('Opening:', testUrl);

  // This will redirect - check where it goes
  window.open(testUrl, '_blank');
};

testOAuth();
```

**What to look for**:
- URL should open and redirect to Google/Slack/Calendly OAuth page
- If you see "Connection Failed: Unsupported OAuth provider" → Backend issue (continue to Step 4)
- If you see "Missing workspace_id or user_id" → Auth data not passed correctly (back to Step 2)

---

### Step 4: Verify Backend Deployment

Check if the latest backend code is actually deployed:

```bash
# Check backend health
curl https://slackcrm-backend.fly.dev/api/v1/health

# Check when it was last deployed
flyctl status -a slackcrm-backend
```

Expected output:
```json
{"status":"ok","version":"1.0.0","timestamp":"2025-11-21..."}
```

---

### Step 5: Check Fly.io Logs

If OAuth still fails, check backend logs for the actual error:

```bash
# Monitor logs in real-time
flyctl logs -a slackcrm-backend

# Then try connecting an integration in the browser
# Watch the logs for errors
```

Look for:
- ❌ "Unsupported OAuth provider" - Means provider not in typeMap
- ❌ "Missing workspace_id or user_id" - Frontend not sending IDs
- ❌ "OAuth error:" - Issue with OAuth service

---

## 🎯 Quick Fix Steps

Based on most common issues:

### Fix 1: Clear Cache and Reload

```bash
# In browser:
1. Open DevTools (F12)
2. Right-click refresh button
3. Click "Empty Cache and Hard Reload"
4. Try connecting integration again
```

### Fix 2: Logout and Login

```bash
1. Go to https://easyteamcrm.netlify.app
2. Logout
3. Clear browser storage:
   localStorage.clear();
   sessionStorage.clear();
4. Login again
5. Try connecting integration
```

### Fix 3: Verify Environment Variable in Browser

On the integrations page, check the actual API URL being used:

```javascript
// Open console and check
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
console.log('Using API:', apiUrl);

// Should be: https://slackcrm-backend.fly.dev/api/v1
// If not, the frontend needs to be rebuilt
```

---

## 🐛 Known Issues and Solutions

### Issue: "Unsupported OAuth provider" for ALL integrations

**Possible Causes**:
1. ❌ User has no workspace → **Logout/login to create workspace**
2. ❌ Token expired → **Logout/login to refresh token**
3. ❌ Frontend using old build → **Hard reload (Ctrl+Shift+R)**
4. ❌ Backend not deployed → **Check `flyctl status`**

### Issue: Works for some integrations but not others

**Solution**: Specific provider not in backend typeMap
- Currently supported: `google`, `slack`, `calendly`
- Check backend code has all providers mapped

### Issue: "Missing workspace_id or user_id"

**Solution**:
```javascript
// Check if data is being fetched correctly
const userData = await fetch('https://slackcrm-backend.fly.dev/api/v1/auth/me', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
}).then(r => r.json());

console.log('User ID:', userData.id);
console.log('Workspace ID:', userData.workspaceId);
```

---

## 📊 Backend Provider Mapping (Current)

```typescript
// backend/src/integrations/integrations.controller.ts
const typeMap: Record<string, IntegrationType> = {
  'google': IntegrationType.GOOGLE,      // ✅ Gmail, Calendar, Contacts
  'slack': IntegrationType.SLACK,        // ✅ Slack bot + OAuth
  'microsoft': IntegrationType.MICROSOFT, // ⚠️  Not used in frontend yet
  'salesforce': IntegrationType.SALESFORCE, // ⚠️  Not used in frontend yet
  'hubspot': IntegrationType.HUBSPOT,    // ⚠️  Not used in frontend yet
  'zoom': IntegrationType.ZOOM,          // ⚠️  Not used in frontend yet
  'docusign': IntegrationType.DOCUSIGN,  // ⚠️  Not used in frontend yet
  'calendly': IntegrationType.CALENDLY,  // ✅ Calendly bookings
};
```

## 🔗 Frontend OAuth Integrations (Current)

From `frontend/app/(dashboard)/integrations/page.tsx`:

1. **Slack** - Line 100-111
   - `oauth: true`
   - `oauthProvider: 'slack'`

2. **Gmail** - Line 146-158
   - `oauth: true`
   - `oauthProvider: 'google'`

3. **Calendly** - Line 298-309
   - `oauth: true`
   - `oauthProvider: 'calendly'`

All three are mapped in backend ✅

---

## 🚀 Next Steps

1. **Run Step 2 debug script** to check authentication
2. **If no workspace_id**: Logout and login again
3. **If still failing**: Run Step 5 to check Fly.io logs
4. **Share results**: Run the debug script and share console output

---

## 💡 What Was Fixed

### Previous Issue
Backend `typeMap` was missing `'calendly'` mapping, causing "Unsupported OAuth provider" error for Calendly.

### Fix Applied (Deployed)
Added to backend `/integrations/oauth/:provider` endpoint:
```typescript
'calendly': IntegrationType.CALENDLY,
```

### Deployment
- ✅ Built successfully
- ✅ Deployed to Fly.io: `flyctl deploy -a slackcrm-backend`
- ✅ Health check passing: https://slackcrm-backend.fly.dev/api/v1/health

---

## 📞 Still Having Issues?

Run the **complete debug sequence** and share the output:

```javascript
// Complete debug script
(async () => {
  console.log('=== OAUTH DEBUG REPORT ===\n');

  const apiUrl = 'https://slackcrm-backend.fly.dev/api/v1';
  const token = localStorage.getItem('accessToken');

  console.log('1. API URL:', apiUrl);
  console.log('2. Token exists:', !!token);

  if (!token) {
    console.error('❌ STOP: No token found. Please login.');
    return;
  }

  try {
    const authResponse = await fetch(`${apiUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('3. Auth response status:', authResponse.status);

    if (!authResponse.ok) {
      console.error('❌ STOP: Auth failed. Token invalid or expired.');
      console.error('   Solution: Logout and login again');
      return;
    }

    const userData = await authResponse.json();
    console.log('4. User ID:', userData.id || '❌ MISSING');
    console.log('5. Workspace ID:', userData.workspaceId || '❌ MISSING');
    console.log('6. Email:', userData.email);

    if (!userData.id || !userData.workspaceId) {
      console.error('\n❌ CRITICAL: Missing user ID or workspace ID');
      console.error('   Solution: Logout and login again to create workspace');
      return;
    }

    console.log('\n✅ Authentication OK');
    console.log('\n7. Testing OAuth URLs:');

    ['google', 'slack', 'calendly'].forEach(provider => {
      const url = `${apiUrl}/integrations/oauth/${provider}?workspace_id=${userData.workspaceId}&user_id=${userData.id}`;
      console.log(`   ${provider}:`, url);
    });

    console.log('\n✅ All checks passed. OAuth should work.');
    console.log('   If still getting errors, share this output.');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('   Details:', error);
  }

  console.log('\n=== END DEBUG REPORT ===');
})();
```

Copy the entire console output and share for further debugging.
