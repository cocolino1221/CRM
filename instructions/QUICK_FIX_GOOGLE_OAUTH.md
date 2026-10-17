# Quick Fix pentru "Unsupported OAuth provider"

## Problema

Când dai click pe "Connect" pentru Google integration, primești:
```
Integration failed: Unsupported OAuth provider
Redirecting back to integrations...
```

## Cauza

Backend-ul nu recunoaște provider-ul OAuth din URL.

## Fix Rapid - Verifică Setup

### 1. Verifică că Fly.io Secrets sunt setate:

```bash
flyctl secrets list -a slackcrm-backend | grep OAUTH_GOOGLE
```

Ar trebui să vezi:
- `OAUTH_GOOGLE_CLIENT_ID`
- `OAUTH_GOOGLE_CLIENT_SECRET`
- `OAUTH_GOOGLE_REDIRECT_URI`
- `OAUTH_GOOGLE_SCOPES`

Dacă lipsesc, rulează:
```bash
flyctl secrets set \
  OAUTH_GOOGLE_CLIENT_ID="883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc.apps.googleusercontent.com" \
  OAUTH_GOOGLE_CLIENT_SECRET="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" \
  OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" \
  OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly" \
  FRONTEND_URL="https://easyteamcrm.netlify.app" \
  -a slackcrm-backend
```

### 2. Verifică Google Cloud Console

Du-te la: https://console.cloud.google.com/apis/credentials

Găsește: `883405672837-n4l3h3ngag9fs54vntt419tk7a9rh7sc...`

**Authorized redirect URIs** trebuie să conțină:
```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback
```

Dacă lipsește, adaugă-l și SAVE.

### 3. Test Direct OAuth Flow

Încearcă să accesezi direct în browser:

```
https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/google?workspace_id=YOUR_WORKSPACE_ID&user_id=YOUR_USER_ID
```

**Cum găsești workspace_id și user_id:**

1. Loghează-te în app: https://easyteamcrm.netlify.app
2. Deschide Console (F12)
3. Rulează:
   ```javascript
   const token = localStorage.getItem('accessToken');
   const decoded = JSON.parse(atob(token.split('.')[1]));
   console.log('User ID:', decoded.sub);
   console.log('Workspace ID:', decoded.workspaceId);
   ```

Apoi înlocuiește în URL-ul de test.

### 4. Verifică Logs în Timp Real

```bash
flyctl logs -a slackcrm-backend
```

Apoi încearcă din nou să conectezi Google integration.
Logs ar trebui să arate:
- ✅ "OAuth start failed" = vezi exact ce eroare
- ✅ "No handler found" = integrarea nu e configurată corect
- ✅ "OAuth credentials not configured" = secrets lipsă

---

## Fix pentru 400 Sync Error

Error-ul de sync e SEPARAT și e **NORMAL** pentru:
- Typeform (webhook-based, nu sync)
- Integrări fără sync implementat

Pentru a evita eroarea, actualizează frontend să nu facă auto-sync pentru integrări webhook-based.

**În** `frontend/app/(dashboard)/integrations/[id]/page.tsx` **linia 71:**

```typescript
// Înainte
await api.post(`/integrations/${integrationId}/sync`);

// După (cu error handling)
try {
  await api.post(`/integrations/${integrationId}/sync`);
  setSuccess('Sync started successfully!');
} catch (err: any) {
  // Ignore sync errors for webhook-based integrations
  if (err.response?.status === 400 && err.response?.data?.message?.includes('not yet implemented')) {
    setSuccess('This integration works via webhooks - no sync needed!');
  } else {
    setError(err.response?.data?.message || 'Failed to trigger sync');
  }
}
```

---

## Checklist Complet

- [ ] Fly.io secrets setate (OAUTH_GOOGLE_*)
- [ ] Google Console redirect URIs adăugate
- [ ] Așteptat 5-10 minute după Google Console update
- [ ] Testat OAuth direct în browser
- [ ] Verificat logs pentru erori specifice
- [ ] Frontend rebuildat pe Netlify (dacă ai făcut modificări)

---

## Test Final

1. Du-te la: https://easyteamcrm.netlify.app/integrations
2. Găsește "Gmail" sau integrare Google
3. Click "Connect"
4. Ar trebui să te redirecteze la Google OAuth
5. După autorizare, ar trebui să revii în app cu integrarea conectată

---

## Dacă Tot Nu Merge

### Debug în Console Browser

1. Deschide https://easyteamcrm.netlify.app/integrations
2. F12 → Console
3. Click "Connect" pe Google
4. Verifică în Network tab ce URL se deschide
5. Ar trebui să fie ceva gen:
   ```
   https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/google?workspace_id=xxx&user_id=yyy
   ```

Dacă lipsește `?workspace_id=` sau `&user_id=`, asta e problema!

### Fix: Asigură-te că user e logat

Eroarea apare dacă:
- Token-ul JWT a expirat
- User nu e logat corect
- localStorage nu are `accessToken`

**Soluție:** Logout și login din nou:
```
https://easyteamcrm.netlify.app/login
```

---

**Need more help?** Check logs:
```bash
flyctl logs -a slackcrm-backend --tail 100
```
