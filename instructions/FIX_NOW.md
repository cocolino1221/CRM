# 🚨 FIX ACUM - Redirect URI Mismatch

## ⚠️ Primești Error 400: redirect_uri_mismatch?

**Backend-ul trimite URI-ul CORECT, dar consola OAuth are URI-ul VECHI!**

---

## ✅ CE TREBUIE SĂ FACI ACUM (2 minute):

### Pe ce integrare primești eroarea?
- [ ] Google
- [ ] Slack
- [ ] Microsoft
- [ ] Altă integrare

---

## 📧 Pentru GOOGLE:

### Pași EXACȚI:

1. **Deschide:** https://console.cloud.google.com

2. **Selectează proiectul** tău (SlackCRM sau cum l-ai numit)

3. **Click:** "APIs & Services" (din meniul lateral stânga)

4. **Click:** "Credentials"

5. **Găsește** OAuth 2.0 Client ID (numele tău, ex: "SlackCRM Backend" sau "Web client")

6. **Click** pe numele lui (să îl editezi)

7. **În secțiunea "Authorized redirect URIs":**

   **a) ȘTERGE** URI-ul vechi dacă există:
   ```
   ❌ https://slackcrm-backend.fly.dev/integrations/oauth/callback
   ```

   **b) ADAUGĂ** URI-ul NOU (click "ADD URI"):
   ```
   ✅ https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```

8. **Click "SAVE"** (jos în pagină)

9. **Așteaptă 30 secunde** (pentru cache)

10. **Încearcă din nou** să te conectezi din CRM

---

## 🔮 Pentru SLACK:

### Pași EXACȚI:

1. **Deschide:** https://api.slack.com/apps

2. **Click** pe aplicația ta (SlackCRM)

3. **Click** "OAuth & Permissions" (din meniul lateral stânga)

4. **Scroll** la secțiunea "Redirect URLs"

5. **ȘTERGE** URL-ul vechi (dacă există):
   ```
   ❌ https://slackcrm-backend.fly.dev/integrations/oauth/callback
   ```

6. **Click "Add New Redirect URL"**

7. **Introdu** URL-ul NOU:
   ```
   ✅ https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```

8. **Click "Add"**

9. **Click "Save URLs"** (jos în pagină)

10. **Încearcă din nou** să te conectezi din CRM

---

## 👥 Pentru MICROSOFT:

### Pași EXACȚI:

1. **Deschide:** https://portal.azure.com

2. **Mergi la:** "Azure Active Directory" → "App registrations"

3. **Click** pe aplicația ta (SlackCRM)

4. **Click** "Authentication" (din meniul lateral stânga)

5. **În secțiunea "Redirect URIs":**

   **a) ȘTERGE** URI-ul vechi:
   ```
   ❌ https://slackcrm-backend.fly.dev/integrations/oauth/callback
   ```

   **b) Click "Add URI"**

   **c) Introdu** URI-ul NOU:
   ```
   ✅ https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
   ```

6. **Click "Save"** (sus în pagină)

7. **Încearcă din nou** să te conectezi din CRM

---

## 🎯 URL-ul CORECT pentru TOATE integrările:

```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

**IMPORTANT:**
- ✅ Trebuie să includă `/api/v1` în path
- ✅ Este același pentru TOATE integrările OAuth
- ✅ Backend-ul DEJA trimite acest URI
- ⚠️ TREBUIE actualizat în consola provider-ului

---

## 🔍 Cum Să Verifici Dacă E Corect:

După ce ai salvat în console:

1. **Refresh pagina** în CRM (Ctrl+Shift+R)
2. **Click "Connect"** pe integrare
3. **Ar trebui să te redirecteze** la provider (Google, Slack, etc.)
4. **După autorizare** ar trebui să revii în CRM fără eroare

---

## ❌ Dacă încă nu merge:

### Verifică că:
- ✅ AI SALVAT în consola OAuth (buton "Save")
- ✅ URI-ul e EXACT (copiază-paste, fără spații)
- ✅ Ai așteptat 30-60 secunde (cache OAuth)
- ✅ Încerci din nou cu incognito mode

### Verifică logs:
```bash
flyctl logs -a slackcrm-backend
```

Ar trebui să vezi ceva de genul:
```
Generated OAuth URL for google (xxx)
OAuth parameters: {
  "client_id": "...",
  "redirect_uri": "https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback",
  ...
}
```

---

## 📝 Checklist:

- [ ] Am identificat integrarea care dă eroare (Google, Slack, etc.)
- [ ] Am deschis consola OAuth a provider-ului
- [ ] Am găsit secțiunea Redirect URIs
- [ ] Am șters URI-ul vechi (dacă există)
- [ ] Am adăugat URI-ul NOU cu `/api/v1`
- [ ] Am salvat modificările
- [ ] Am așteptat 30-60 secunde
- [ ] Am încercat din nou din CRM
- [ ] ✅ MERGE!

---

## 🆘 Încă Ai Nevoie De Ajutor?

**Pentru Google:** Screenshot-ează secțiunea "Authorized redirect URIs"

**Pentru Slack:** Screenshot-ează secțiunea "Redirect URLs"

**Pentru Microsoft:** Screenshot-ează secțiunea "Redirect URIs"

Și trimite-mi să văd ce ai configurat.

---

**✨ După actualizare, va merge 100%! Backend-ul este deja fixat! ✨**
