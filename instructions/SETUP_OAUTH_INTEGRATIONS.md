# Configurare Integrări OAuth - Ghid Complet

Acest ghid te va ajuta să configurezi toate integrările OAuth astfel încât utilizatorii finali să facă doar click pe "Connect".

## 🎯 URL-uri Importante

**Backend URL:** `https://slackcrm-backend.fly.dev/api/v1`
**Redirect URI:** `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
**Frontend URL:** `[URL-ul tău frontend]`

⚠️ **IMPORTANT:** Redirect URI trebuie să includă `/api/v1` în path!

---

## 1. 📧 Google Workspace (Gmail, Calendar, Contacts)

### Pasii:
1. **Accesează:** https://console.cloud.google.com
2. **Creează proiect nou:**
   - Click "Select a project" → "New Project"
   - Nume: "SlackCRM" sau similar
   - Click "Create"

3. **Activează APIs:**
   - Mergi la "APIs & Services" → "Library"
   - Activează următoarele:
     - Gmail API
     - Google Calendar API
     - People API (pentru Contacts)
     - Google Drive API

4. **Configurează OAuth Consent Screen:**
   - Mergi la "APIs & Services" → "OAuth consent screen"
   - User Type: External
   - App name: SlackCRM
   - User support email: [your-email]
   - Developer contact: [your-email]
   - Scopes: Add:
     - `.../auth/gmail.readonly`
     - `.../auth/calendar`
     - `.../auth/contacts.readonly`
     - `.../auth/drive.readonly`
     - `.../auth/drive.file`
   - Save

5. **Creează OAuth Credentials:**
   - Mergi la "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: Web application
   - Name: SlackCRM Backend
   - Authorized redirect URIs: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Click "Create"
   - **Copiază:** Client ID și Client Secret

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_GOOGLE_CLIENT_ID="YOUR_CLIENT_ID" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file" -a slackcrm-backend
```

---

## 2. 🔮 Slack

### Pasii:
1. **Accesează:** https://api.slack.com/apps
2. **Creează aplicație:**
   - Click "Create New App" → "From scratch"
   - App Name: SlackCRM
   - Workspace: [Your workspace]
   - Click "Create App"

3. **Configurează OAuth:**
   - Mergi la "OAuth & Permissions"
   - Redirect URLs: Add `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Scopes (Bot Token Scopes):
     - `channels:read`
     - `chat:write`
     - `users:read`
     - `users:read.email`
     - `team:read`

4. **Obține Credentials:**
   - Mergi la "Basic Information"
   - **Copiază:** Client ID și Client Secret

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_SLACK_CLIENT_ID="YOUR_CLIENT_ID" -a slackcrm-backend
flyctl secrets set OAUTH_SLACK_CLIENT_SECRET="YOUR_CLIENT_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_SLACK_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
```

---

## 3. 👥 Microsoft 365 (Outlook, Teams)

### Pasii:
1. **Accesează:** https://portal.azure.com
2. **Mergi la:** Azure Active Directory → App registrations
3. **Creează aplicație:**
   - Click "New registration"
   - Name: SlackCRM
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Web → `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Click "Register"

4. **Configurează Permissions:**
   - Mergi la "API permissions" → "Add a permission" → "Microsoft Graph"
   - Delegated permissions:
     - `Mail.Read`
     - `Calendars.Read`
     - `Contacts.Read`
     - `User.Read`
   - Click "Add permissions"
   - Click "Grant admin consent" (dacă ești admin)

5. **Creează Client Secret:**
   - Mergi la "Certificates & secrets" → "New client secret"
   - Description: SlackCRM Backend
   - Expires: 24 months
   - Click "Add"
   - **Copiază SECRET VALUE imediat (nu se mai arată după)!**

6. **Obține Client ID:**
   - Mergi la "Overview"
   - **Copiază:** Application (client) ID

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_MICROSOFT_CLIENT_ID="YOUR_CLIENT_ID" -a slackcrm-backend
flyctl secrets set OAUTH_MICROSOFT_CLIENT_SECRET="YOUR_CLIENT_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_MICROSOFT_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_MICROSOFT_SCOPES="https://graph.microsoft.com/Mail.Read,https://graph.microsoft.com/Calendars.Read,https://graph.microsoft.com/Contacts.Read" -a slackcrm-backend
```

---

## 4. 🧡 HubSpot

### Pasii:
1. **Accesează:** https://developers.hubspot.com/
2. **Creează aplicație:**
   - Click "Apps" → "Create app"
   - App name: SlackCRM
   - Description: CRM Integration

3. **Configurează OAuth:**
   - Tab "Auth"
   - Redirect URL: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Scopes: Select:
     - `crm.objects.contacts.read`
     - `crm.objects.contacts.write`
     - `crm.objects.deals.read`
     - `crm.objects.deals.write`
     - `crm.objects.companies.read`
   - Save

4. **Obține Credentials:**
   - Tab "Auth"
   - **Copiază:** Client ID și Client Secret

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_HUBSPOT_CLIENT_ID="YOUR_CLIENT_ID" -a slackcrm-backend
flyctl secrets set OAUTH_HUBSPOT_CLIENT_SECRET="YOUR_CLIENT_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_HUBSPOT_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_HUBSPOT_SCOPES="crm.objects.contacts.read,crm.objects.contacts.write,crm.objects.deals.read,crm.objects.deals.write,crm.objects.companies.read" -a slackcrm-backend
```

---

## 5. ☁️ Salesforce

### Pasii:
1. **Accesează:** https://login.salesforce.com (sau your Salesforce domain)
2. **Setup → Apps → App Manager:**
   - Click "New Connected App"
   - Connected App Name: SlackCRM
   - Contact Email: [your-email]
   - Enable OAuth Settings: ✓
   - Callback URL: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Selected OAuth Scopes:
     - `Full access (full)`
     - `Perform requests at any time (refresh_token, offline_access)`
   - Save

3. **Obține Credentials:**
   - După salvare, Click "Manage Consumer Details"
   - **Copiază:** Consumer Key (Client ID) și Consumer Secret (Client Secret)

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_SALESFORCE_CLIENT_ID="YOUR_CONSUMER_KEY" -a slackcrm-backend
flyctl secrets set OAUTH_SALESFORCE_CLIENT_SECRET="YOUR_CONSUMER_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_SALESFORCE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_SALESFORCE_SCOPES="api,refresh_token" -a slackcrm-backend
```

---

## 6. 🎥 Zoom

### Pasii:
1. **Accesează:** https://marketplace.zoom.us/
2. **Develop → Build App:**
   - Choose "OAuth" app type
   - Click "Create"
   - App name: SlackCRM
   - Choose "User-managed app"
   - Disable "Would you like to publish this app on Zoom Marketplace?" (dacă vrei doar pentru tine)
   - Continue

3. **Configurează OAuth:**
   - Tab "App Credentials"
   - **Copiază:** Client ID și Client Secret
   - Redirect URL for OAuth: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Add Allow List: `https://slackcrm-backend.fly.dev`

4. **Scopes:**
   - Tab "Scopes"
   - Add scopes:
     - `meeting:write`
     - `meeting:read`
     - `user:read`
   - Continue

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_ZOOM_CLIENT_ID="YOUR_CLIENT_ID" -a slackcrm-backend
flyctl secrets set OAUTH_ZOOM_CLIENT_SECRET="YOUR_CLIENT_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_ZOOM_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_ZOOM_SCOPES="meeting:write,meeting:read,user:read" -a slackcrm-backend
```

---

## 7. ✍️ DocuSign

### Pasii:
1. **Accesează:** https://developers.docusign.com/
2. **Apps and Keys:**
   - Click "Add App and Integration Key"
   - App Name: SlackCRM
   - Click "Create App"

3. **Configurează OAuth:**
   - Redirect URI: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Additional Redirect URI (optional): Frontend URL
   - Save

4. **Generate Secret:**
   - Click "Add Secret Key"
   - **Copiază:** Integration Key (Client ID) și Secret Key (Client Secret)

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_DOCUSIGN_CLIENT_ID="YOUR_INTEGRATION_KEY" -a slackcrm-backend
flyctl secrets set OAUTH_DOCUSIGN_CLIENT_SECRET="YOUR_SECRET_KEY" -a slackcrm-backend
flyctl secrets set OAUTH_DOCUSIGN_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_DOCUSIGN_SCOPES="signature,impersonation" -a slackcrm-backend
```

---

## 8. 📅 Calendly ⭐ NOU

### Pasii:
1. **Accesează:** https://developer.calendly.com/
2. **Register Your App:**
   - Click "Get Started" sau "Register an App"
   - Sign in cu contul Calendly
   - Application Name: SlackCRM
   - Redirect URI: `https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`
   - Description: CRM integration for appointment scheduling
   - Submit

3. **Obține Credentials:**
   - După aprobare, mergi la "My Apps"
   - Click pe SlackCRM app
   - **Copiază:** Client ID și Client Secret

### Setează în Fly.io:
```bash
flyctl secrets set OAUTH_CALENDLY_CLIENT_ID="YOUR_CLIENT_ID" -a slackcrm-backend
flyctl secrets set OAUTH_CALENDLY_CLIENT_SECRET="YOUR_CLIENT_SECRET" -a slackcrm-backend
flyctl secrets set OAUTH_CALENDLY_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_CALENDLY_SCOPES="default" -a slackcrm-backend
```

---

## 🔄 Restart Backend După Setarea Secretelor

După ce ai setat toate secretele, restart backend:

```bash
flyctl restart -a slackcrm-backend
```

---

## ✅ Verificare

Verifică că toate secretele sunt setate:

```bash
flyctl secrets list -a slackcrm-backend
```

Ar trebui să vezi:
- OAUTH_GOOGLE_CLIENT_ID
- OAUTH_GOOGLE_CLIENT_SECRET
- OAUTH_SLACK_CLIENT_ID
- OAUTH_SLACK_CLIENT_SECRET
- OAUTH_MICROSOFT_CLIENT_ID
- OAUTH_MICROSOFT_CLIENT_SECRET
- OAUTH_HUBSPOT_CLIENT_ID
- OAUTH_HUBSPOT_CLIENT_SECRET
- OAUTH_SALESFORCE_CLIENT_ID
- OAUTH_SALESFORCE_CLIENT_SECRET
- OAUTH_ZOOM_CLIENT_ID
- OAUTH_ZOOM_CLIENT_SECRET
- OAUTH_DOCUSIGN_CLIENT_ID
- OAUTH_DOCUSIGN_CLIENT_SECRET
- OAUTH_CALENDLY_CLIENT_ID
- OAUTH_CALENDLY_CLIENT_SECRET

---

## 🎯 Pentru Utilizatori Finali

După configurare, utilizatorii vor:
1. Merge la pagina Integrations în CRM
2. Click pe "Connect" pentru integrarea dorită
3. Vor fi redirectați către provider (Google, Slack, etc.)
4. Vor autoriza aplicația SlackCRM
5. Vor fi redirectați înapoi cu integrarea activă

**NU MAI TREBUIE API KEYS PERSONALE!** Totul e gestionat prin OAuth.

---

## 📝 Note Importante

- **Redirect URI trebuie să fie identic** în toate locurile (provider + Fly.io secrets)
- **Scopes** determină ce permisiuni cere aplicația
- **Google:** Poți folosi Test users dacă aplicația nu e verificată
- **Microsoft:** Dacă nu ești admin, users pot consimți individual
- **Salesforce:** Asigură-te că folosești correct login URL (production vs sandbox)
- **Zoom:** Free plans au limitări pentru OAuth apps
- **DocuSign:** Developer/Demo account poate avea limitări

---

## 🆘 Troubleshooting

**Eroare "redirect_uri_mismatch":**
- Verifică că URL-ul din provider match exact cu cel din Fly.io secrets

**Eroare "invalid_client":**
- Verifică Client ID și Secret sunt corecte
- Verifică că sunt setate în Fly.io

**Eroare "access_denied":**
- User-ul a refuzat autorizarea
- Sau app-ul nu are permisiunile necesare

**Integrarea nu apare în listă:**
- Verifică că handler-ul e înregistrat în backend
- Verifică că backend-ul a pornit corect după setarea secretelor
