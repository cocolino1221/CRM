# 🔧 Fix Google Sign-Up Error

## The Problem

You're getting:
```
Error 400: redirect_uri_mismatch
```

This means the **redirect URI** is not configured in your Google Cloud Console for **USER AUTHENTICATION** (login/signup).

**Note**: This is DIFFERENT from the integration OAuth we fixed earlier. You have TWO separate Google OAuth clients:
1. **User Authentication** (login/signup) - Uses `/auth/google/callback`
2. **Gmail Integration** (connecting Gmail) - Uses `/integrations/oauth/callback`

---

## ✅ THE FIX

### Step 1: Go to Google Cloud Console

Open: https://console.cloud.google.com/apis/credentials

### Step 2: Find Your OAuth Client

Look for the client ID:
```
883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
```

Click on it to edit.

### Step 3: Add the Redirect URI

In the **"Authorized redirect URIs"** section, **ADD** this URL:

```
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
```

**IMPORTANT**: You should have TWO redirect URIs total:

1. `https://slackcrm-backend.fly.dev/api/v1/auth/google/callback` ← For user login/signup (ADD THIS)
2. `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback` ← For Gmail integration (already there)

### Step 4: Save

Click **"SAVE"** at the bottom of the page.

### Step 5: Wait

**Wait 5-10 minutes** for Google to propagate the changes.

### Step 6: Test

Go to https://easyteamcrm.netlify.app/register and try signing up with Google again.

---

## 📸 Visual Guide

When you open the OAuth client in Google Console, you should see:

**Authorized redirect URIs:**
```
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

---

## 🔍 Why This Happened

Your Google OAuth client only had the `/integrations/oauth/callback` redirect URI (for connecting Gmail integration).

But when users try to **SIGN UP or LOGIN** with Google, the app uses a DIFFERENT endpoint: `/auth/google/callback`

Since that URI wasn't in Google Console, Google rejected it with "redirect_uri_mismatch".

---

## ⚠️ Common Mistakes

### ❌ Wrong: Adding only one URI
You need BOTH redirect URIs:
- One for user authentication (login/signup)
- One for Gmail integration

### ❌ Wrong: Using http:// instead of https://
Must be `https://` for production

### ❌ Wrong: Forgetting to wait
Changes take 5-10 minutes to propagate

### ✅ Correct: Both URIs configured
```
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

---

## 🧪 Test After Fix

1. **Wait 10 minutes** after saving in Google Console
2. Go to https://easyteamcrm.netlify.app/register
3. Click "Sign up with Google"
4. Should redirect to Google login ✅
5. After authorizing, should redirect back to your app ✅

---

## 📞 Still Not Working?

If after 10 minutes it still doesn't work:

1. **Check the exact client ID** in Google Console matches:
   ```
   883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
   ```

2. **Check the redirect URIs** are EXACTLY:
   ```
   https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
   https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```
   (No trailing slashes, no typos)

3. **Clear browser cache** and try again in incognito mode

---

## 🎯 Quick Reference

**Your Google OAuth Client ID:**
```
883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com
```

**Required Redirect URIs:**
```
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

**Google Cloud Console:**
https://console.cloud.google.com/apis/credentials

---

**TL;DR**: Add `https://slackcrm-backend.fly.dev/api/v1/auth/google/callback` to your Google OAuth client's redirect URIs, wait 10 minutes, try again.
