# 🔧 Fix Redirect URI Mismatch

## ⚠️ Problema

Dacă primești eroarea **"Error 400: redirect_uri_mismatch"** când încerci să te conectezi la o integrare, înseamnă că URL-ul de redirect nu se potrivește între aplicația OAuth și backend.

---

## ✅ Soluția (2 minute)

### URL-ul Corect de Redirect:

```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

**IMPORTANT:** URL-ul trebuie să includă `/api/v1` în path!

---

## 🔧 Cum să Fixezi pentru Fiecare Integrare

### 1. 📧 Google (Google Cloud Console)

1. Mergi la: https://console.cloud.google.com
2. Selectează proiectul tău (SlackCRM sau cum l-ai numit)
3. Mergi la **"APIs & Services"** → **"Credentials"**
4. Click pe OAuth 2.0 Client ID (cel creat pentru SlackCRM)
5. În secțiunea **"Authorized redirect URIs"**:
   - **ȘTERGE** orice URI vechi (dacă există)
   - **ADAUGĂ** URI-ul nou: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
6. Click **"Save"**
7. ✅ Gata! Acum OAuth va funcționa

---

### 2. 🔮 Slack (Slack API Console)

1. Mergi la: https://api.slack.com/apps
2. Selectează aplicația ta SlackCRM
3. Mergi la **"OAuth & Permissions"** (din sidebar)
4. În secțiunea **"Redirect URLs"**:
   - **ȘTERGE** URL-ul vechi (dacă există)
   - Click **"Add New Redirect URL"**
   - Introdu: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Click **"Add"**
5. Click **"Save URLs"**
6. ✅ Gata!

---

### 3. 👥 Microsoft (Azure Portal)

1. Mergi la: https://portal.azure.com
2. Mergi la **"Azure Active Directory"** → **"App registrations"**
3. Selectează aplicația ta SlackCRM
4. Click pe **"Authentication"** (din sidebar)
5. În secțiunea **"Redirect URIs"**:
   - **ȘTERGE** URI-ul vechi (dacă există)
   - Click **"Add URI"**
   - Platform: **Web**
   - URI: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
6. Click **"Save"**
7. ✅ Gata!

---

### 4. 🧡 HubSpot

1. Mergi la: https://developers.hubspot.com/
2. Click pe **"Apps"** → Selectează aplicația ta
3. Mergi la tab **"Auth"**
4. În secțiunea **"Redirect URL"**:
   - Înlocuiește cu: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
5. Click **"Save"**
6. ✅ Gata!

---

### 5. ☁️ Salesforce

1. Mergi la: https://login.salesforce.com (sau your Salesforce domain)
2. Setup → **Apps** → **App Manager**
3. Găsește aplicația ta SlackCRM → Click **"View"**
4. Click **"Manage Consumer Details"** apoi **"Edit Policies"**
5. În secțiunea **"Callback URL"**:
   - Înlocuiește cu: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
6. Click **"Save"**
7. ✅ Gata!

---

### 6. 🎥 Zoom

1. Mergi la: https://marketplace.zoom.us/
2. **Develop** → **Build App** → Selectează aplicația ta
3. Mergi la tab **"App Credentials"**
4. În secțiunea **"Redirect URL for OAuth"**:
   - Înlocuiește cu: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
5. În **"Add Allow List"**: `https://slackcrm-backend.fly.dev`
6. Click **"Continue"** sau **"Save"**
7. ✅ Gata!

---

### 7. ✍️ DocuSign

1. Mergi la: https://developers.docusign.com/
2. **Apps and Keys** → Selectează aplicația ta
3. În secțiunea **"Redirect URI"**:
   - Înlocuiește cu: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
4. Click **"Save"**
5. ✅ Gata!

---

### 8. 📅 Calendly

1. Mergi la: https://developer.calendly.com/
2. **My Apps** → Selectează aplicația ta
3. În secțiunea **"Redirect URI"**:
   - Înlocuiește cu: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
4. Click **"Save"**
5. ✅ Gata!

---

## 🔄 După Actualizare

**Nu trebuie să faci nimic în backend!** Redirect URI-ul este deja configurat corect.

Doar:
1. ✅ Actualizează redirect URI în console-ul provider-ului (Google, Slack, etc.)
2. ✅ Așteaptă 1-2 minute (uneori cache-ul OAuth durează puțin)
3. ✅ Încearcă din nou să te conectezi din CRM

---

## ✅ Verificare Rapidă

După ce ai actualizat redirect URI în console:

1. Deschide CRM-ul
2. Mergi la **Integrations**
3. Click **"Connect"** pe integrarea pe care ai fixat-o
4. Ar trebui să fii redirectat către provider (Google, Slack, etc.)
5. După autorizare, ar trebui să revii în CRM cu integrarea conectată ✅

**Dacă încă primești eroare:**
- Verifică că URL-ul din console e EXACT: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
- Verifică că nu ai spații sau caractere în plus
- Așteaptă 2-3 minute (cache OAuth)
- Încearcă în incognito mode

---

## 📝 De Reținut

**URL-ul corect de redirect pentru TOATE integrările:**
```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

**IMPORTANT:**
- ✅ Include `/api/v1` în path
- ✅ Este același pentru toate integrările OAuth
- ✅ Nu trebuie schimbat în backend (e deja corect)
- ✅ Trebuie actualizat doar în console-urile provider-ilor

---

## 🆘 Încă Nu Merge?

Verifică logs pentru detalii:
```bash
flyctl logs -a slackcrm-backend
```

Sau contactează support cu:
- Integrarea care nu merge (Google, Slack, etc.)
- Mesajul exact de eroare
- Screenshot-ul din console-ul OAuth

---

**✨ După fix, OAuth va funcționa perfect! ✨**
