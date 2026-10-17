# 🚀 START HERE - Configurare Integrări OAuth

## ✅ Ce E Deja Gata

- ✅ Backend deplouat pe Fly.io: https://slackcrm-backend.fly.dev
- ✅ 13 integrări implementate și testate
- ✅ Toate handler-urile funcționale
- ✅ OAuth flow complet
- ✅ Baza de date PostgreSQL
- ✅ API endpoints complete

## 🎯 Ce Trebuie Să Faci (3 Pași Simpli)

### 📝 Pasul 1: Alege Integrările (5 min)

Decide ce integrări vrei să oferi utilizatorilor. **Recomandare pentru început:**

- ✅ **Google** (Gmail + Calendar) - Cel mai popular
- ✅ **Slack** - Pentru notificări
- ✅ **Calendly** - Pentru scheduling

**Opțional (poți adăuga mai târziu):**
- Microsoft 365
- HubSpot
- Salesforce
- Zoom
- DocuSign

### ⚙️ Pasul 2: Configurează OAuth Apps (15-30 min per integrare)

Pentru fiecare integrare aleasă:

1. **Deschide ghidul:** `SETUP_OAUTH_INTEGRATIONS.md`
2. **Găsește secțiunea** integrării (ex: #1 pentru Google)
3. **Urmează pașii exact** (creează app, configurează OAuth, copiază credentials)
4. **Setează secrets pe Fly.io** cu comenzile din ghid

**Exemplu pentru Google:**
```bash
# După ce ai Client ID și Secret de la Google:
flyctl secrets set OAUTH_GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_CLIENT_SECRET="GOCSPX-xxx" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_REDIRECT_URI="https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback" -a slackcrm-backend
flyctl secrets set OAUTH_GOOGLE_SCOPES="https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/contacts.readonly,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file" -a slackcrm-backend
```

### 🔄 Pasul 3: Restart & Test (2 min)

```bash
# 1. Restart backend
flyctl restart -a slackcrm-backend

# 2. Verifică configurarea
./scripts/check-oauth-setup.sh

# 3. Testează din frontend
# - Deschide CRM → Integrations
# - Click "Connect" pe Google
# - Autorizează contul
# - Verifică că apare "Connected" ✅
```

---

## 📚 Documentație Completă

- **Ghid detaliat OAuth:** `SETUP_OAUTH_INTEGRATIONS.md` (pas cu pas pentru fiecare integrare)
- **Ghid rapid:** `QUICK_SETUP.md` (versiunea scurtă)
- **README integrări:** `INTEGRATIONS_README.md` (arhitectură și flow-uri)
- **Script verificare:** `./scripts/check-oauth-setup.sh` (verifică ce e configurat)

---

## 🎯 Checklist Rapid

### Pentru Google (exemplu):
- [ ] Am creat proiect în Google Cloud Console
- [ ] Am activat Gmail API, Calendar API, People API
- [ ] Am configurat OAuth Consent Screen
- [ ] Am creat OAuth 2.0 Client ID
- [ ] Am copiat Client ID și Client Secret
- [ ] Am setat secretele pe Fly.io (4 comenzi)
- [ ] Am restartat backend-ul
- [ ] Am testat connect din frontend ✅

**Repetă pentru fiecare integrare dorită!**

---

## 💡 Tips

**Începe mic:** Configurează doar 2-3 integrări la început. Poți adăuga restul mai târziu.

**Testează imediat:** După fiecare integrare configurată, testează-o din frontend.

**Salvează credentials:** Păstrează Client ID și Secret într-un password manager.

**Verifică logs:** Dacă ceva nu merge, vezi logs cu `flyctl logs -a slackcrm-backend`

---

## 🆘 Probleme Comune

### "redirect_uri_mismatch"
→ URL-ul de redirect trebuie să fie exact:
`https://slackcrm-backend.fly.dev/api/v1/integrations/oauth/callback`

### "invalid_client"
→ Verifică că ai setat corect Client ID și Secret:
```bash
flyctl secrets list -a slackcrm-backend
```

### "Integrarea nu apare"
→ Verifică că ai setat toate secretele și ai restartat backend-ul

---

## 🎉 După Setup

Odată configurat:
- **Utilizatorii finali** fac doar click "Connect"
- **Sunt redirectați** la provider pentru autorizare
- **Revin în CRM** cu integrarea activă
- **ZERO configurare** pentru ei!

**Totul e gestionat automat prin OAuth!** 🚀

---

## 📞 Next Steps

1. ✅ Alege 2-3 integrări pentru început
2. ✅ Urmează `SETUP_OAUTH_INTEGRATIONS.md` pentru fiecare
3. ✅ Setează secrets pe Fly.io
4. ✅ Restart backend
5. ✅ Testează din frontend
6. 🎉 **LAUNCH!**

---

**Questions?** Vezi ghidurile detaliate sau rulează `./scripts/check-oauth-setup.sh`

**Ready?** Deschide `SETUP_OAUTH_INTEGRATIONS.md` și începe cu Google! 📧
