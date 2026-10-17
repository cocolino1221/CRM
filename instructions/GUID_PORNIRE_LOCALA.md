# 🚀 Ghid Pornire Locală - SlackCRM

## 📋 Pași Rapizi

### 1. Pornește Backend-ul

```bash
cd backend
npm install  # dacă nu ai instalat dependențele
npm run start:dev
```

Backend-ul va rula pe: **http://localhost:3000**
- API Docs (Swagger): http://localhost:3000/api/docs
- Health Check: http://localhost:3000/api/v1/health

### 2. Pornește Frontend-ul

Într-un terminal nou:

```bash
cd frontend
npm install  # dacă nu ai instalat dependențele
npm run dev
```

Frontend-ul va rula pe: **http://localhost:3001**

### 3. Pornește Totul deodată (Recomandat)

Din root-ul proiectului:

```bash
npm run dev
```

Această comandă pornește simultan backend-ul și frontend-ul.

---

## ⚠️ Rezolvare Problemă Zoom OAuth

### Problema
Eroarea apare pentru că în `backend/.env` ai valori placeholder pentru Zoom:
```
OAUTH_ZOOM_CLIENT_ID=your-zoom-client-id
OAUTH_ZOOM_CLIENT_SECRET=your-zoom-client-secret
```

### Soluția

Ai două opțiuni:

#### Opțiunea 1: Configurează Zoom OAuth (Recomandat)

1. **Creează OAuth App pe Zoom:**
   - Accesează: https://marketplace.zoom.us/
   - **Develop → Build App → OAuth**
   - App name: SlackCRM
   - Choose "User-managed app"
   - **Copiază:** Client ID și Client Secret

2. **Configurează Redirect URI:**
   - Redirect URL: `http://localhost:3000/api/v1/integrations/oauth/callback`
   - Add Allow List: `http://localhost:3000`

3. **Configurează Scopes:**
   - `meeting:write`
   - `meeting:read`
   - `user:read`

4. **Actualizează `.env`:**
   ```bash
   cd backend
   # Editează .env și înlocuiește:
   OAUTH_ZOOM_CLIENT_ID="YOUR_REAL_CLIENT_ID"
   OAUTH_ZOOM_CLIENT_SECRET="YOUR_REAL_CLIENT_SECRET"
   OAUTH_ZOOM_REDIRECT_URI="http://localhost:3000/api/v1/integrations/oauth/callback"
   OAUTH_ZOOM_SCOPES="meeting:write,meeting:read,user:read"
   ```

5. **Restart backend:**
   ```bash
   # Oprește backend-ul (Ctrl+C) și pornește din nou:
   npm run start:dev
   ```

#### Opțiunea 2: Dezactivează Zoom (Temporar)

Dacă nu ai nevoie de Zoom acum, poți să comentezi sau ștergi variabilele din `.env`:

```bash
# Comentează liniile Zoom în backend/.env:
# OAUTH_ZOOM_CLIENT_ID=your-zoom-client-id
# OAUTH_ZOOM_CLIENT_SECRET=your-zoom-client-secret
```

**Notă:** Integrarea Zoom va apărea ca "neconfigurată" în interfață, dar aplicația va funcționa pentru celelalte integrări.

---

## ✅ Verificare

După ce ai configurat Zoom OAuth:

1. **Verifică că backend-ul rulează:**
   ```bash
   curl http://localhost:3000/api/v1/health
   ```

2. **Verifică că frontend-ul rulează:**
   - Deschide: http://localhost:3001
   - Ar trebui să vezi aplicația

3. **Testează Zoom OAuth:**
   - Mergi la: http://localhost:3001/integrations
   - Click pe Zoom → "Connect"
   - Ar trebui să te redirecționeze la Zoom pentru autorizare

---

## 🔧 Probleme Comune

### "Port already in use"
```bash
# Găsește procesul care folosește portul:
lsof -ti:3000  # pentru backend
lsof -ti:3001  # pentru frontend

# Oprește procesul:
kill -9 <PID>
```

### "Database connection failed"
Verifică că ai configurat corect `DATABASE_URL` sau variabilele de bază de date în `backend/.env`.

### "Module not found"
```bash
# Reinstalează dependențele:
cd backend && rm -rf node_modules && npm install
cd ../frontend && rm -rf node_modules && npm install
```

---

## 📚 Documentație Suplimentară

- **Setup OAuth complet:** `SETUP_OAUTH_INTEGRATIONS.md`
- **README principal:** `README.md`
- **Start here:** `START_HERE.md`

---

**Gata! Aplicația ar trebui să ruleze local acum! 🎉**



