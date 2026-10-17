# Mutarea pe server propriu

De la Netlify (frontend) + Fly.io (backend) + Neon (Postgres) la patru
containere pe o singură mașină.

Ce se mută: 3.605 contacte, toată istoria de activități, 7 workspace-uri.
Partea reversibilă e aplicația. Partea ireversibilă e baza de date — de
aceea pașii de mai jos opresc scrierile înainte de dump și **verifică
rândurile** înainte de a muta DNS-ul.

---

## Înainte de ziua comutării

### 1. Pe server

```bash
# Docker + compose plugin, apoi:
git clone <repo> /opt/easyteam
cd /opt/easyteam/deploy
cp .env.example .env && cp .env.backend.example .env.backend
# completează ambele (vezi pasul 2)
```

### 2. Secretele

`fly secrets list` arată **doar numele**, nu valorile. Pentru fiecare:

```bash
fly ssh console -a slackcrm-backend -C "printenv JWT_SECRET"
```

Sunt 55. Patru categorii, tratate diferit:

| Categorie | Ce faci |
|---|---|
| Chei de semnare (`JWT_SECRET`, `ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`) | **Copiezi identic.** Dacă le schimbi, toate sesiunile pică și datele criptate devin necitibile. |
| Chei externe (Meta, Google, WhatsApp, APNs, Resend) | Copiezi identic. |
| URL-uri (`FRONTEND_URL`, `APP_URL`, `*_REDIRECT_URI`, `GOOGLE_CALLBACK_URL`) | **Le schimbi** către noile adrese. |
| `DATABASE_URL`, `DB_SSL` | Nu le pui în `.env.backend` — le setează `docker-compose.yml`. |

### 3. Adresele de redirect la furnizori

Pe lângă variabilele de mediu, aceleași adrese trebuie actualizate în
**Google Cloud Console**, **Meta for Developers** și **Slack API**. Dacă
uiți pasul ăsta, autentificarea cu Google pică exact în momentul comutării,
iar mesajul de eroare nu spune de ce.

### 4. Imaginea de frontend

Adaugă în `frontend/next.config.js`:

```js
output: 'standalone',
```

Fără el, imaginea cară tot `node_modules`. **Nu am făcut-o deja**: Netlify
construiește din același fișier, iar modificarea lui azi ar schimba build-ul
curent fără nevoie. Se face în ziua comutării, după ce Netlify nu mai contează.

### 5. Repetiție generală (recomandat, sâmbătă/duminică)

```bash
export NEON_URL='postgres://…neon.tech/neondb?sslmode=require'
export LOCAL_URL='postgres://easyteam:…@localhost:5432/easyteam'

docker compose up -d postgres
./migrate-database.sh dump
./migrate-database.sh restore
./migrate-database.sh verify     # trebuie să iasă verde
docker compose up -d --build
```

Aplicația pornește pe date reale, fără ca nimeni să fie mutat pe ea. Aici
descoperi ce lipsește, nu marți la ora 10.

---

## Ziua comutării

**Coboară TTL-ul DNS la 300 de secunde cu 24 de ore înainte.** Altfel
întoarcerea, dacă e nevoie, durează cât vechiul TTL.

| # | Pas | Verificare |
|---|---|---|
| 1 | Anunță echipa: ~30 de minute fără scriere | — |
| 2 | Oprește backendul vechi: `fly scale count 0 -a slackcrm-backend` | `curl` către API dă eroare |
| 3 | `./migrate-database.sh dump` | fișierul are dimensiune plauzibilă |
| 4 | `./migrate-database.sh restore` | fără erori |
| 5 | **`./migrate-database.sh verify`** | **verde, altfel OPREȘTE-TE** |
| 6 | `docker compose up -d --build` | `docker compose ps` — toate `healthy` |
| 7 | Testează pe IP, înainte de DNS (`/etc/hosts` local) | login, listă leaduri, o pagină publică |
| 8 | Mută DNS: `A` pentru app și api către IP-ul serverului | `dig` arată noul IP |
| 9 | Verifică certificatele | `https://` fără avertisment |
| 10 | Login cu Google | funcționează (pasul 3 de mai sus) |
| 11 | Trimite un mesaj WhatsApp de test | ajunge |
| 12 | Pornește backup-ul: `crontab -e` → `backup.sh` | rulează noaptea |

### Întoarcerea, dacă ceva nu merge

Până la pasul 8 e gratis: `fly scale count 1` și totul e ca înainte, pentru
că Neon n-a fost atins — `pg_dump` doar citește. După pasul 8, întoarcerea
înseamnă DNS înapoi **plus** mutarea scrierilor făcute între timp pe noua
bază. De aceea pasul 7 e înainte de 8 și nu invers.

---

## Ce se schimbă după mutare

**Backup-urile devin ale tale.** Neon le făcea fără să ceară nimănui nimic.
`backup.sh` rulează nocturn și verifică arhiva, dar restaurarea tot trebuie
încercată o dată, pe o bază de test — un backup nerestaurat vreodată e o
speranță, nu un backup.

**Domeniile clienților devin ușoare.** Caddy cere backendului confirmarea
(`/landing-pages/domains/check`) și emite singur certificatul la prima
cerere. Clientul adaugă un CNAME și pagina merge — fără niciun apel de API
către vreun furnizor, fără limită de plan.

**Redis rămâne în containerul de backend**, cu volum propriu
(`redis_data`). Nu e un serviciu separat; dacă ștergi volumul, pierzi cozile
de joburi.

**Erorile de TypeScript tot nu opresc build-ul.** `next.config.js` are
`ignoreBuildErrors: true`. Verificarea rămâne `npx tsc --noEmit`, rulat
separat.
