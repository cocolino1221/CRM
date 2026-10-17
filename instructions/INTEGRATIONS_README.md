# 🔌 Sistem de Integrări - Ghid Complet

## 📋 Ce Ai Acum

✅ **Backend deplouat:** https://slackcrm-backend.fly.dev
✅ **13 integrări gata de utilizat**
✅ **Toate handler-urile implementate și testate**
✅ **OAuth flow complet funcțional**

---

## 🎯 Cum Funcționează pentru Utilizatori

### Pentru Utilizatorii Finali:
1. **Deschid CRM-ul** → Click pe pagina "Integrations"
2. **Văd lista de integrări disponibile** (Google, Slack, etc.)
3. **Click pe "Connect"** pentru integrarea dorită
4. **Sunt redirectați** către provider (ex: Google) pentru autorizare
5. **Autorizează aplicația** → Grant permissions
6. **Redirectați înapoi** în CRM cu integrarea activă ✅

**NU TREBUIE API KEYS!** Totul e gestionat automat prin OAuth.

---

## ⚙️ Ce Trebuie Să Faci (One-Time Setup)

### Pasul 1: Creează Aplicații OAuth

Pentru fiecare integrare pe care vrei să o oferi utilizatorilor, trebuie să creezi o aplicație OAuth la provider-ul respectiv.

**📖 Ghid Detaliat:** Vezi `SETUP_OAUTH_INTEGRATIONS.md`

**🚀 Ghid Rapid:** Vezi `QUICK_SETUP.md`

**Recomandare:** Începe cu 2-3 integrări:
- Google (cel mai folosit)
- Slack (pentru notificări)
- Calendly (pentru scheduling)

### Pasul 2: Setează Credențialele pe Fly.io

După ce ai Client ID și Client Secret de la fiecare provider:

```bash
# Exemplu pentru Google
flyctl secrets set OAUTH_GOOGLE_CLIENT_ID="your-client-id" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_CLIENT_SECRET="your-secret" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,..." -a slackcrm-backend
```

### Pasul 3: Restart Backend

```bash
flyctl restart -a slackcrm-backend
```

### Pasul 4: Verificare

```bash
# Rulează scriptul de verificare
./scripts/check-oauth-setup.sh

# Sau manual
flyctl secrets list -a slackcrm-backend
```

---

## 🎨 Lista Completă de Integrări

### 🔐 Integrări OAuth (Utilizatorii doar dau click "Connect"):

| Integrare | Status | Setup Guide |
|-----------|--------|-------------|
| 🔮 **Slack** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #2 |
| 📧 **Google Workspace** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #1 |
| 👥 **Microsoft 365** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #3 |
| 🧡 **HubSpot** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #4 |
| ☁️ **Salesforce** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #5 |
| 🎥 **Zoom** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #6 |
| ✍️ **DocuSign** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #7 |
| 📅 **Calendly** | ✅ Gata | Vezi SETUP_OAUTH_INTEGRATIONS.md #8 |

### 🔑 Integrări API Key (Utilizatorii introduc propriile API keys):

| Integrare | Status | Note |
|-----------|--------|------|
| 📝 **Typeform** | ✅ Gata | Utilizatorii introduc Personal Access Token |
| 📄 **PandaDoc** | ✅ Gata | Utilizatorii introduc API Key |
| 💬 **WhatsApp Business** | ✅ Gata | Utilizatorii introduc Phone ID + Access Token |

### 🔧 Integrări Developer:

| Integrare | Status | Note |
|-----------|--------|------|
| 🔗 **Webhook** | ✅ Gata | Generic webhook receiver |
| ⚡ **Custom API** | ✅ Gata | REST API connector |

---

## 🔒 Securitate

### OAuth (Google, Slack, etc.):
- ✅ Client ID/Secret sunt DOAR pe server (Fly.io secrets)
- ✅ Utilizatorii finali NU văd credențialele
- ✅ Fiecare utilizator autorizează PROPRIUL cont
- ✅ Token-uri stocate encrypted în PostgreSQL
- ✅ Automatic token refresh când expiră
- ✅ Revoke anytime prin UI

### API Key (Typeform, PandaDoc, etc.):
- ✅ Fiecare utilizator își introduce propriul API key
- ✅ Keys stocate encrypted în PostgreSQL
- ✅ Vizibile doar utilizatorului care le-a adăugat
- ✅ Delete anytime prin UI

---

## 📊 Endpoints API

### Pentru Frontend:

```
GET  /integrations/available          # Lista integrărilor disponibile
GET  /integrations                    # Integrările utilizatorului curent
POST /integrations/install            # Instalează o integrare (API key)
GET  /integrations/oauth/:type        # Începe OAuth flow
GET  /integrations/oauth/callback     # OAuth callback (automatic)
POST /integrations/:id/test           # Testează conexiunea
POST /integrations/:id/sync           # Sincronizează datele
DELETE /integrations/:id              # Șterge integrarea
```

### Webhook Receiver:

```
POST /integrations/webhook/:type      # Primește webhook de la provider
```

---

## 🎯 Flow-uri Complete

### OAuth Flow (Google, Slack, etc.):

```
1. User click "Connect Google" în CRM
   ↓
2. Frontend → GET /integrations/oauth/google?workspace_id=xxx&user_id=xxx
   ↓
3. Backend redirectează la Google OAuth
   ↓
4. User autorizează în Google
   ↓
5. Google → GET /integrations/oauth/callback?code=xxx&state=xxx
   ↓
6. Backend schimbă code cu access_token
   ↓
7. Backend salvează integration în DB (encrypted)
   ↓
8. Backend redirectează la Frontend cu success=true
   ↓
9. Frontend arată "✅ Connected!"
```

### API Key Flow (Typeform, PandaDoc):

```
1. User click "Connect Typeform" în CRM
   ↓
2. Frontend arată modal cu form
   ↓
3. User introduce API Key
   ↓
4. Frontend → POST /integrations/install { type: 'typeform', config: { apiKey: 'xxx' } }
   ↓
5. Backend testează conexiunea
   ↓
6. Backend salvează integration în DB (encrypted)
   ↓
7. Frontend arată "✅ Connected!"
```

### Webhook Flow (Real-time events):

```
1. Provider (Google, Slack, etc.) trimite event
   ↓
2. Provider → POST /integrations/webhook/google { event: 'email.received', ... }
   ↓
3. Backend verifică signature (dacă există)
   ↓
4. Backend găsește handler-ul corespunzător
   ↓
5. Handler procesează event-ul
   ↓
6. Backend creează/updatează date în CRM
   ↓
7. Frontend primește update prin WebSocket/Polling
```

---

## 🧪 Testare

### Test Manual:

1. Deschide frontend
2. Mergi la `/integrations`
3. Click "Connect" pe o integrare configurată
4. Urmează flow-ul OAuth
5. Verifică că apare "Connected" după redirect

### Test Automat:

```bash
# Verifică health
curl https://slackcrm-backend.fly.dev/api/v1/health

# Verifică că API răspunde (trebuie autentificare)
curl https://slackcrm-backend.fly.dev/api/v1/integrations/available
# Răspuns așteptat: {"message":"Unauthorized","statusCode":401}
```

---

## 🐛 Troubleshooting

### "redirect_uri_mismatch"
**Cauză:** URL-ul de redirect nu match în provider
**Fix:** Verifică că URL-ul din provider e exact:
`https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`

### "invalid_client"
**Cauză:** Client ID sau Secret greșit
**Fix:**
```bash
# Verifică secretele
flyctl secrets list -a slackcrm-backend

# Resetează dacă e nevoie
flyctl secrets set OAUTH_GOOGLE_CLIENT_ID="correct-id" -a slackcrm-backend
flyctl restart -a slackcrm-backend
```

### "Integration not available"
**Cauză:** OAuth credentials nu sunt setate
**Fix:**
```bash
# Rulează scriptul de verificare
./scripts/check-oauth-setup.sh

# Adaugă credențialele lipsă
flyctl secrets set OAUTH_XXX_CLIENT_ID="..." -a slackcrm-backend
```

### Backend nu răspunde
**Fix:**
```bash
# Verifică status
flyctl status -a slackcrm-backend

# Vezi logs
flyctl logs -a slackcrm-backend

# Restart
flyctl restart -a slackcrm-backend
```

---

## 📝 Next Steps

1. ✅ **Setup OAuth apps** pentru integrările dorite (Vezi SETUP_OAUTH_INTEGRATIONS.md)
2. ✅ **Setează secrets** pe Fly.io
3. ✅ **Restart backend**
4. ✅ **Testează** din frontend
5. ✅ **Deploy frontend** cu URL-ul corect de backend
6. 🎉 **Launch!**

---

## 🎉 După Setup

Odată ce ai configurat integrările:
- Utilizatorii pot conecta orice integrare în 2 click-uri
- Datele se sincronizează automat
- Webhook-uri primesc events în real-time
- Token-uri se refresh automat
- Totul funcționează fără intervenție manuală

**Zero maintenance!** 🚀

---

## 📞 Support

- **Ghid OAuth:** `SETUP_OAUTH_INTEGRATIONS.md`
- **Quick Setup:** `QUICK_SETUP.md`
- **Verificare:** `./scripts/check-oauth-setup.sh`
- **Logs:** `flyctl logs -a slackcrm-backend`

---

**✨ Sistemul de Integrări este COMPLET și GATA DE PRODUCȚIE! ✨**
