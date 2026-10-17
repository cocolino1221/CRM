# 🔌 Ghid Complet pentru Configurarea Integrărilor

## 📋 Variabile de Mediu Necesare

### Variabile Generale (Obligatorii)

```bash
# URL-ul frontend-ului (unde rulează aplicația Next.js)
FRONTEND_URL=https://your-frontend-domain.com

# URL-ul backend-ului (fără /api/v1 la final)
APP_URL=https://your-backend-domain.com
```

### Integrări OAuth (Google, Slack, Calendly, etc.)

Pentru fiecare integrare OAuth, ai nevoie de:

```bash
# Format: OAUTH_{PROVIDER}_CLIENT_ID
OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_GOOGLE_REDIRECT_URI=https://your-backend-domain.com/api/v1/integrations/oauth/callback
OAUTH_GOOGLE_SCOPES=https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly

OAUTH_SLACK_CLIENT_ID=your-slack-client-id
OAUTH_SLACK_CLIENT_SECRET=your-slack-client-secret
OAUTH_SLACK_REDIRECT_URI=https://your-backend-domain.com/api/v1/integrations/oauth/callback
OAUTH_SLACK_SCOPES=channels:read,chat:write,users:read,files:read,commands,incoming-webhook

OAUTH_CALENDLY_CLIENT_ID=your-calendly-client-id
OAUTH_CALENDLY_CLIENT_SECRET=your-calendly-client-secret
OAUTH_CALENDLY_REDIRECT_URI=https://your-backend-domain.com/api/v1/integrations/oauth/callback
OAUTH_CALENDLY_SCOPES=default
```

**Notă**: Dacă nu setezi `OAUTH_{PROVIDER}_REDIRECT_URI`, se construiește automat din `APP_URL`:
```
{APP_URL}/api/v1/integrations/oauth/callback
```

### Integrări cu API Key

```bash
# Typeform
TYPEFORM_API_KEY=your-typeform-api-key

# WhatsApp (se configurează prin UI)
# Nu necesită variabile de mediu globale
```

---

## 🚀 Pași de Configurare pentru Fiecare Integrare

### 1. Google / Gmail OAuth

#### Pas 1: Creează OAuth Credentials în Google Cloud Console

1. Mergi la [Google Cloud Console](https://console.cloud.google.com/)
2. Selectează sau creează un proiect
3. Activează **Gmail API**, **Google Calendar API**, **People API**, **Google Drive API**
4. Mergi la **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth client ID**
6. Alege **Web application**
7. Configurează:
   - **Name**: SlackCRM Integration
   - **Authorized redirect URIs**: 
     ```
     https://your-backend-domain.com/api/v1/integrations/oauth/callback
     ```
8. Copiază **Client ID** și **Client Secret**

#### Pas 2: Configurează Variabilele de Mediu

```bash
OAUTH_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_GOOGLE_REDIRECT_URI=https://your-backend-domain.com/api/v1/integrations/oauth/callback
```

#### Pas 3: Testează

1. Mergi la `/integrations` în aplicație
2. Click **Connect** pe Gmail
3. Autorizează aplicația în Google
4. Ar trebui să vezi "Connected successfully"

---

### 2. Slack OAuth

#### Pas 1: Creează Slack App

1. Mergi la [Slack API](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Configurează:
   - **App Name**: SlackCRM
   - **Workspace**: Selectează workspace-ul tău
4. Mergi la **OAuth & Permissions**
5. Adaugă **Redirect URLs**:
   ```
   https://your-backend-domain.com/api/v1/integrations/oauth/callback
   ```
6. Adaugă **Bot Token Scopes**:
   - `channels:read`
   - `chat:write`
   - `users:read`
   - `files:read`
   - `commands`
   - `incoming-webhook`
7. Mergi la **Basic Information** → **App Credentials**
8. Copiază **Client ID** și **Client Secret**

#### Pas 2: Configurează Variabilele de Mediu

```bash
OAUTH_SLACK_CLIENT_ID=your-slack-client-id
OAUTH_SLACK_CLIENT_SECRET=your-slack-client-secret
OAUTH_SLACK_REDIRECT_URI=https://your-backend-domain.com/api/v1/integrations/oauth/callback
```

#### Pas 3: Testează

1. Mergi la `/integrations` în aplicație
2. Click **Connect** pe Slack
3. Autorizează aplicația în Slack
4. Ar trebui să vezi "Connected successfully"

---

### 3. Calendly OAuth

#### Pas 1: Creează Calendly App

1. Mergi la [Calendly Developer Portal](https://developer.calendly.com/)
2. Click **My Apps** → **Create App**
3. Configurează:
   - **App Name**: SlackCRM
   - **Redirect URI**: 
     ```
     https://your-backend-domain.com/api/v1/integrations/oauth/callback
     ```
4. Copiază **Client ID** și **Client Secret**

#### Pas 2: Configurează Variabilele de Mediu

```bash
OAUTH_CALENDLY_CLIENT_ID=your-calendly-client-id
OAUTH_CALENDLY_CLIENT_SECRET=your-calendly-client-secret
OAUTH_CALENDLY_REDIRECT_URI=https://your-backend-domain.com/api/v1/integrations/oauth/callback
```

#### Pas 3: Testează

1. Mergi la `/integrations` în aplicație
2. Click **Connect** pe Calendly
3. Autorizează aplicația în Calendly
4. Ar trebui să vezi "Connected successfully"

---

### 4. Typeform (API Key)

#### Pas 1: Obține API Key

1. Mergi la [Typeform Account Settings](https://admin.typeform.com/account)
2. Mergi la **Personal tokens**
3. Click **Generate new token**
4. Copiază token-ul (începe cu `tfp_`)

#### Pas 2: Configurează în Aplicație

1. Mergi la `/integrations` în aplicație
2. Click **Connect** pe Typeform
3. Introdu:
   - **Personal Access Token**: Token-ul tău Typeform
   - **Form ID**: ID-ul formularului (opțional, pentru webhooks)

#### Pas 3: Configurează Webhook (Opțional)

După conectare, poți configura webhook-uri pentru a primi notificări când cineva completează formularul.

---

## 🔧 Troubleshooting

### Eroare: "OAuth credentials not configured"

**Cauză**: Variabilele de mediu pentru OAuth nu sunt setate.

**Soluție**: 
1. Verifică că ai setat `OAUTH_{PROVIDER}_CLIENT_ID` și `OAUTH_{PROVIDER}_CLIENT_SECRET`
2. Restart backend-ul după ce adaugi variabilele

### Eroare: "redirect_uri_mismatch"

**Cauză**: Redirect URI-ul din aplicație nu se potrivește cu cel configurat în provider (Google/Slack/etc).

**Soluție**:
1. Verifică că redirect URI-ul în provider este exact:
   ```
   https://your-backend-domain.com/api/v1/integrations/oauth/callback
   ```
2. Asigură-te că `APP_URL` este setat corect în backend
3. Sau setează explicit `OAUTH_{PROVIDER}_REDIRECT_URI`

### Eroare: "OAuth provider did not return a refresh token"

**Cauză**: Google nu returnează refresh token dacă aplicația a fost deja autorizată.

**Soluție**:
1. Pentru Google, acest lucru este normal - integrarea funcționează până când token-ul expiră (~1 oră)
2. Pentru a obține refresh token, revocă accesul în [Google Account Settings](https://myaccount.google.com/permissions) și reconectează-te
3. Pentru alte integrări (Slack, Calendly), refresh token-ul este obligatoriu

### Eroare: "Integration not found" sau "Invalid OAuth state"

**Cauză**: State token-ul OAuth a expirat sau este invalid.

**Soluție**:
1. Reîncearcă conectarea (state token-urile expiră după 10 minute)
2. Asigură-te că ești logat în aplicație
3. Verifică că `JWT_SECRET` este setat corect (folosit pentru semnarea state-ului)

### Integrarea se conectează dar testul de conexiune eșuează

**Cauză**: Token-ul a expirat sau nu ai permisiunile necesare.

**Soluție**:
1. Verifică că ai acordat toate permisiunile necesare în provider
2. Pentru Google, verifică că ai activat API-urile necesare în Google Cloud Console
3. Pentru Slack, verifică că ai adăugat toate scope-urile necesare
4. Încearcă să te reconectezi

---

## 📝 Checklist Final

Înainte de a testa integrările, asigură-te că:

- [ ] `FRONTEND_URL` este setat corect
- [ ] `APP_URL` este setat corect (fără `/api/v1`)
- [ ] `JWT_SECRET` este setat (minim 32 caractere)
- [ ] Pentru fiecare integrare OAuth:
  - [ ] `OAUTH_{PROVIDER}_CLIENT_ID` este setat
  - [ ] `OAUTH_{PROVIDER}_CLIENT_SECRET` este setat
  - [ ] Redirect URI este configurat în provider (Google/Slack/etc)
  - [ ] Redirect URI se potrivește cu `APP_URL/api/v1/integrations/oauth/callback`
- [ ] Backend-ul a fost restartat după adăugarea variabilelor
- [ ] Ești logat în aplicație când testezi integrările

---

## 🎯 Quick Start Example

Pentru un setup rapid cu Google:

```bash
# .env în backend
FRONTEND_URL=https://your-frontend.com
APP_URL=https://your-backend.com
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
OAUTH_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

În Google Cloud Console:
- Redirect URI: `https://your-backend.com/api/v1/integrations/oauth/callback`

Apoi testează în aplicație la `/integrations` → Click "Connect" pe Gmail.

---

## 📚 Resurse Suplimentare

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Slack OAuth Documentation](https://api.slack.com/authentication/oauth-v2)
- [Calendly OAuth Documentation](https://developer.calendly.com/api-docs/ZG9jOjM2MzE2MDM4-oauth-2)

---

**Ultima actualizare**: 2025-01-XX
**Versiune**: 1.0



