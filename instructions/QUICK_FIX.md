# ⚡ QUICK FIX - Redirect URI Mismatch

## ❌ Eroarea

```
Error 400: redirect_uri_mismatch
```

---

## ✅ Soluția (1 minut)

### Ce trebuie să faci:

1. **Mergi în consola OAuth** a integrării care nu merge (Google, Slack, etc.)
2. **Găsește secțiunea Redirect URI** (vezi ghidul detaliat `FIX_REDIRECT_URI.md`)
3. **Înlocuiește cu URL-ul corect:**

```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

4. **Salvează**
5. **Încearcă din nou** din CRM după 1-2 minute

---

## 🔗 Link-uri Rapide

### Google
👉 https://console.cloud.google.com → APIs & Services → Credentials → OAuth Client ID → Edit → Authorized redirect URIs

### Slack
👉 https://api.slack.com/apps → Your App → OAuth & Permissions → Redirect URLs

### Microsoft
👉 https://portal.azure.com → Azure AD → App registrations → Your App → Authentication → Redirect URIs

### HubSpot
👉 https://developers.hubspot.com → Apps → Your App → Auth → Redirect URL

### Salesforce
👉 Setup → Apps → App Manager → Your App → View → Edit Policies → Callback URL

### Zoom
👉 https://marketplace.zoom.us → Develop → Your App → App Credentials → Redirect URL

### DocuSign
👉 https://developers.docusign.com → Apps and Keys → Your App → Redirect URI

### Calendly
👉 https://developer.calendly.com → My Apps → Your App → Redirect URI

---

## 📝 URL-ul Corect

**Pentru TOATE integrările:**
```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

⚠️ **IMPORTANT:** Trebuie să includă `/api/v1` în path!

---

## 🎯 După Fix

1. ✅ Salvează în consola OAuth
2. ✅ Așteaptă 1-2 minute
3. ✅ Încearcă din nou din CRM
4. 🎉 **Va merge!**

---

**Vezi ghid detaliat:** `FIX_REDIRECT_URI.md`

**Probleme?** Verifică logs: `flyctl logs -a slackcrm-backend`
