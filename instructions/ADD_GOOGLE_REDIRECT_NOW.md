# 🚨 ADD GOOGLE REDIRECT URI - STEP BY STEP

## The Problem
You're getting: **Error 400: redirect_uri_mismatch**

This means Google doesn't recognize the redirect URL your app is using.

---

## ✅ THE FIX (Follow These Exact Steps)

### Step 1: Open Google Cloud Console

**Click this link**: https://console.cloud.google.com/apis/credentials

You'll see a list of your OAuth 2.0 Client IDs.

---

### Step 2: Find Your OAuth Client

Look for this Client ID:
```
883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
```

**Click on it** (click the name, not the checkbox).

---

### Step 3: Scroll to "Authorized redirect URIs"

You'll see a section called **"Authorized redirect URIs"**.

It probably has one URI already:
```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

---

### Step 4: Click "+ ADD URI"

Click the **"+ ADD URI"** button.

---

### Step 5: Add This EXACT URI

Copy and paste this EXACT URL:
```
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
```

**⚠️ IMPORTANT**:
- Must be `https://` (not http://)
- Must be `/auth/google/callback` (not `/integrations/oauth/callback`)
- No trailing slash
- Copy-paste to avoid typos

---

### Step 6: Save

Click **"SAVE"** button at the bottom of the page.

You'll see a message: "Client ID updated"

---

### Step 7: Wait 5-10 Minutes

Google needs time to propagate the changes across their servers.

**IMPORTANT**: Don't try to sign in immediately. Wait at least 5-10 minutes.

---

### Step 8: Try Signing Up Again

After waiting:

1. Go to https://easyteamcrm.netlify.app/register
2. Click "Sign in with Google"
3. It should work now! ✅

---

## ✅ Final Check

After adding the URI, you should have **TWO** redirect URIs total:

1. ✅ `https://slackcrm-backend.fly.dev/api/v1/auth/google/callback` ← For user login/signup (NEW)
2. ✅ `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback` ← For Gmail integration (EXISTING)

---

## 🔍 Visual Reference

When you're done, the "Authorized redirect URIs" section should look like this:

```
Authorized redirect URIs

https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback

+ ADD URI
```

---

## 🐛 Troubleshooting

### "I don't see the OAuth client"
- Make sure you're logged into the correct Google account
- Check you're in the correct project (top of page)

### "I added it but still getting error"
- Wait 10 minutes (seriously, wait!)
- Clear browser cache
- Try in incognito mode
- Make sure you copied the URI exactly (no spaces, no typos)

### "I see multiple OAuth clients"
- Look for the one with Client ID: `883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc`
- Or look for the one that already has the integrations callback URI

---

## 📞 Still Need Help?

If after 10 minutes it still doesn't work:

1. **Screenshot** the "Authorized redirect URIs" section
2. **Screenshot** the error you're getting
3. Share both screenshots

---

## 🎯 Quick Checklist

- [ ] Opened Google Cloud Console
- [ ] Found OAuth client: 883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc
- [ ] Clicked on it
- [ ] Clicked "+ ADD URI"
- [ ] Added: `https://slackcrm-backend.fly.dev/api/v1/auth/google/callback`
- [ ] Clicked "SAVE"
- [ ] Waited 10 minutes
- [ ] Tried signing up again

---

**TL;DR**: Add `https://slackcrm-backend.fly.dev/api/v1/auth/google/callback` to Google OAuth redirect URIs, wait 10 minutes, try again.
