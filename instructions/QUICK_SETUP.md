# 🚀 Setup Rapid - Integrări OAuth

## ⚡ PAȘII SIMPLI

### 1️⃣ Creează Aplicațiile OAuth (30-60 min)

Urmează ghidul detaliat din `SETUP_OAUTH_INTEGRATIONS.md` pentru fiecare integrare pe care vrei să o folosești.

**Minimum recomandat pentru început:**
- ✅ Google (Gmail + Calendar) - cel mai popular
- ✅ Slack - pentru notificări
- ✅ Calendly - pentru scheduling

**Opțional (poți adăuga mai târziu):**
- Microsoft 365
- HubSpot
- Salesforce
- Zoom
- DocuSign

---

### 2️⃣ Setează Secretele pe Fly.io

După ce ai credențialele, folosește comenzile din ghid pentru fiecare integrare.

**Exemplu pentru Google:**
```bash
flyctl secrets set OAUTH_GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_CLIENT_SECRET="GOCSPX-xxx" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file" -a slackcrm-backend
```

---

### 3️⃣ Restart Backend

```bash
flyctl restart -a slackcrm-backend
```

Verifică că a pornit corect:
```bash
flyctl status -a slackcrm-backend
```

---

### 4️⃣ Testează

1. Deschide frontend-ul
2. Mergi la pagina **Integrations**
3. Click pe **Connect** pentru Google (sau altă integrare)
4. Ar trebui să fii redirectat către Google pentru autorizare
5. După autorizare, revii în CRM cu integrarea conectată ✅

---

## 🎯 Checklist Rapid

- [ ] Am creat aplicația Google OAuth
- [ ] Am setat `OAUTH_GOOGLE_CLIENT_ID` pe Fly.io
- [ ] Am setat `OAUTH_GOOGLE_CLIENT_SECRET` pe Fly.io
- [ ] Am setat `OAUTH_GOOGLE_REDIRECT_URI` pe Fly.io
- [ ] Am setat `OAUTH_GOOGLE_SCOPES` pe Fly.io
- [ ] Am restartat backend-ul
- [ ] Am testat connect-ul din frontend ✅

Repetă pentru fiecare integrare!

---

## ⚙️ Comenzi Utile

**Vezi toate secretele:**
```bash
flyctl secrets list -a slackcrm-backend
```

**Șterge un secret (dacă ai greșit):**
```bash
flyctl secrets unset OAUTH_GOOGLE_CLIENT_ID -a slackcrm-backend
```

**Vezi logs în timp real:**
```bash
flyctl logs -a slackcrm-backend
```

**Verifică health:**
```bash
curl https://slackcrm-backend.fly.dev/api/v1/health
```

---

## 🎨 Flow-ul Utilizatorului Final

1. **User deschide CRM** → Merge la Integrations
2. **Click "Connect" pe Google** → Redirected la Google login
3. **Login cu contul Google** → Selectează permisiunile
4. **Authorize** → Redirected înapoi la CRM
5. **✅ Integrare activă!** → Acum poate vedea emails/calendar în CRM

**ZERO configurare pentru utilizator!** Totul e gestionat de aplicația ta OAuth.

---

## 🔒 Securitate

- Secretele OAuth sunt DOAR pe server (Fly.io)
- Utilizatorii finali NU văd Client ID/Secret
- Fiecare utilizator autorizează propriul cont
- Token-urile sunt stocate encrypted în baza de date
- Refresh automat când token-ul expiră

---

## 📊 Status Curent

Backend: ✅ **LIVE** pe https://slackcrm-backend.fly.dev

Integrări disponibile și gata de configurat:
- 🔮 Slack (OAuth)
- 📧 Google Workspace (OAuth)
- 👥 Microsoft 365 (OAuth)
- 🧡 HubSpot (OAuth)
- ☁️ Salesforce (OAuth)
- 🎥 Zoom (OAuth)
- ✍️ DocuSign (OAuth)
- 📅 Calendly (OAuth) ⭐ NOU
- 📝 Typeform (API Key)
- 📄 PandaDoc (API Key)
- 💬 WhatsApp (API Key)
- 🔗 Webhook (Generic)
- ⚡ Custom API (Generic)

**Total: 13 integrări funcționale!** 🎉
