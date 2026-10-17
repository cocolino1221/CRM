# Google OAuth Setup for Production (Fly.io + Netlify)

## 🌐 URL-urile Tale

**Backend (Fly.io):**
```
https://slackcrm-backend.fly.dev
```

**Frontend (Netlify):**
```
https://your-app-name.netlify.app
(sau domeniul tău custom)
```

---

## 📋 Pas 1: Adaugă Redirect URIs în Google Cloud Console

### 1. Accesează Google Cloud Console
🔗 https://console.cloud.google.com/apis/credentials

### 2. Găsește OAuth Client ID
Caută: `883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com`

### 3. Click "Edit" (iconița creion)

### 4. Adaugă Authorized Redirect URIs

**IMPORTANT:** Adaugă EXACT aceste 4 URL-uri:

```
https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
http://localhost:3000/api/v1/auth/google/callback
http://localhost:3000/api/v1/integrations/oauth/callback
```

**Nota:**
- Primele 2 = pentru PRODUCȚIE (Fly.io)
- Ultimele 2 = pentru DEVELOPMENT (localhost)
- Toate 4 trebuie adăugate pentru ca să funcționeze și în dev și în prod

### 5. Click "SAVE" ✅

### 6. Așteaptă 5-10 minute
Google propagă schimbările - nu funcționează instant!

---

## 🔧 Pas 2: Configurează Environment Variables pe Fly.io

### Verifică Setările Actuale

```bash
flyctl secrets list -a slackcrm-backend
```

### Setează/Actualizează Secrets pentru OAuth

```bash
# Google OAuth pentru LOGIN
flyctl secrets set \
  GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="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" \
  GOOGLE_CALLBACK_URL="https://slackcrm-backend.fly.dev/api/v1/auth/google/callback" \
  -a slackcrm-backend
```

```bash
# Google OAuth pentru INTEGRATIONS (Calendar, Gmail)
flyctl secrets set \
  OAUTH_GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  OAUTH_GOOGLE_CLIENT_SECRET="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" \
  OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly" \
  -a slackcrm-backend
```

```bash
# Frontend URL (pentru OAuth callback redirects)
flyctl secrets set \
  FRONTEND_URL="https://your-netlify-app.netlify.app" \
  -a slackcrm-backend
```

**⚠️ IMPORTANT:** Înlocuiește `https://your-netlify-app.netlify.app` cu URL-ul real al frontend-ului tău de pe Netlify!

### Setează și Rate Limiting (bonus fix)

```bash
flyctl secrets set \
  THROTTLE_TTL=60 \
  THROTTLE_LIMIT=200 \
  -a slackcrm-backend
```

---

## 📱 Pas 3: Configurează Environment Variables pe Netlify

### 1. Du-te la Netlify Dashboard
🔗 https://app.netlify.com

### 2. Selectează site-ul tău

### 3. Site settings → Environment variables

### 4. Adaugă/Actualizează:

```bash
NEXT_PUBLIC_API_URL=https://slackcrm-backend.fly.dev/api/v1
```

**Verifică că nu are trailing slash `/` la final!**

### 5. Trigger rebuild
Site overview → Deploys → Trigger deploy → Deploy site

---

## 🧪 Pas 4: Testare

### Test 1: Verifică Backend URLs

```bash
# Verifică că backend răspunde
curl https://slackcrm-backend.fly.dev/api/v1/health

# Ar trebui să primești: {"status":"ok"}
```

### Test 2: Verifică Google OAuth Redirect

```bash
# Vizitează în browser:
https://slackcrm-backend.fly.dev/api/v1/auth/google

# Ar trebui să te redirecteze către Google OAuth
# (nu ar trebui să vezi eroare 400 redirect_uri_mismatch)
```

### Test 3: Login în Frontend

1. Deschide frontend-ul: `https://your-app.netlify.app/login`
2. Click pe "Login with Google"
3. Alege contul Google
4. Ar trebui să te redirecteze înapoi la dashboard

**Dacă vezi eroare:**
- Verifică redirect URIs în Google Console (din nou)
- Așteaptă încă 5-10 minute
- Clear browser cache
- Încearcă în incognito mode

---

## 🔍 Troubleshooting

### Error: "redirect_uri_mismatch"

**Verifică:**
1. ✅ URL-urile în Google Console sunt EXACT:
   ```
   https://slackcrm-backend.fly.dev/api/v1/auth/google/callback
   https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```
   (fără trailing slash, cu `/api/v1`)

2. ✅ Fly.io secrets conțin URL-ul corect:
   ```bash
   flyctl secrets list -a slackcrm-backend | grep GOOGLE
   ```

3. ✅ Ai așteptat 5-10 minute după salvarea în Google Console

4. ✅ Ai cleared browser cache / folosești incognito

### Error: "CORS policy error"

**Cauză:** Backend nu acceptă request-uri de la frontend

**Fix:** Adaugă pe Fly.io:
```bash
flyctl secrets set \
  FRONTEND_URL="https://your-netlify-app.netlify.app" \
  -a slackcrm-backend
```

Apoi verifică în `backend/src/main.ts` că CORS e configurat corect.

### Error: "Failed to fetch user info"

**Cauză:** Scopes lipsă sau OAuth token invalid

**Fix:**
```bash
flyctl secrets set \
  OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly" \
  -a slackcrm-backend
```

### Backend nu răspunde

**Verifică logs:**
```bash
flyctl logs -a slackcrm-backend
```

**Verifică status:**
```bash
flyctl status -a slackcrm-backend
```

**Restart:**
```bash
flyctl machine restart -a slackcrm-backend
```

---

## 📦 Deploy Checklist

După ce faci modificări la cod:

### Backend (Fly.io)
```bash
# 1. Build și deploy
flyctl deploy -a slackcrm-backend

# 2. Verifică deployment
flyctl status -a slackcrm-backend

# 3. Verifică logs
flyctl logs -a slackcrm-backend

# 4. Test health
curl https://slackcrm-backend.fly.dev/api/v1/health
```

### Frontend (Netlify)
```bash
# 1. Push to git
git add .
git commit -m "Update OAuth config"
git push

# Netlify auto-deploy (dacă ai continuous deployment)

# SAU manual:
cd frontend
npm run build
netlify deploy --prod
```

---

## 🎯 Quick Setup Script

Salvează și rulează:

```bash
#!/bin/bash

# ÎNLOCUIEȘTE cu URL-ul real Netlify
NETLIFY_URL="https://your-app.netlify.app"

echo "🚀 Configurare Google OAuth pentru Producție..."

# Set Fly.io secrets
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

echo "✅ Secrets configurate!"
echo ""
echo "📝 Următorii pași:"
echo "1. Du-te la: https://console.cloud.google.com/apis/credentials"
echo "2. Adaugă redirect URIs:"
echo "   - https://slackcrm-backend.fly.dev/api/v1/auth/google/callback"
echo "   - https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback"
echo "3. Așteaptă 5-10 minute"
echo "4. Testează: $NETLIFY_URL/login"
```

---

## 📊 Verificare Finală

### ✅ Checklist Complete

- [ ] Redirect URIs adăugate în Google Console
- [ ] Fly.io secrets configurate (toate 8+)
- [ ] Netlify environment variables configurate
- [ ] Așteptat 5-10 minute după Google Console update
- [ ] Backend health check OK: `curl https://slackcrm-backend.fly.dev/api/v1/health`
- [ ] Google OAuth redirect OK: `https://slackcrm-backend.fly.dev/api/v1/auth/google`
- [ ] Frontend se încarcă: `https://your-app.netlify.app`
- [ ] Login cu Google funcționează

### 🎉 Success Indicators

Totul funcționează când:
- ✅ Click pe "Login with Google" → redirectează la Google
- ✅ Alegi contul → redirectează înapoi la app
- ✅ Dashboard se încarcă cu user info
- ✅ Integrări Google (Calendar, Gmail) pot fi conectate
- ✅ Nu mai vezi erori 400 redirect_uri_mismatch

---

## 📞 Need Help?

**Verifică logs:**
```bash
# Backend
flyctl logs -a slackcrm-backend

# Check secrets
flyctl secrets list -a slackcrm-backend
```

**Test manual OAuth flow:**
1. Browser: `https://slackcrm-backend.fly.dev/api/v1/auth/google`
2. Ar trebui să redirecteze la Google
3. După login, ar trebui să redirecteze la frontend cu token

**Common issues:**
- Redirect URI mismatch → verifică Google Console
- CORS errors → verifică FRONTEND_URL pe Fly.io
- 500 errors → verifică logs cu `flyctl logs`

---

## 🔐 Security Notes

**Credentials în Repository:**
- ✅ `.env` files sunt în `.gitignore`
- ✅ Secrets sunt în Fly.io (encrypted)
- ✅ Netlify env vars (nu sunt în git)

**NICIODATĂ nu commite:**
- `backend/.env`
- `frontend/.env.local`
- API keys sau secrets în cod

---

## 📚 Related Docs

- `OAUTH_FIX_GUIDE.md` - Ghid general OAuth
- `INTEGRATION_STATUS.md` - Status toate integrările
- `INTEGRATION_FIXES_SUMMARY.md` - Summary fix-uri

---

**Gata! După ce adaugi redirect URIs în Google Console și setezi secrets pe Fly.io, totul ar trebui să funcționeze! 🚀**
