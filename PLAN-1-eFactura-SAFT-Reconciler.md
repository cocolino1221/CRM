# PLAN EXECUTIV #1 — e-Factura/SAF-T Smart Reconciler

**Numele de lucru:** ReconcilAI (sau alege tu)
**Target ARR an 1:** €100K MRR până în luna 18 (€1.2M ARR)
**Profil utilizator:** dev solo cu mindset QA, buget €3-5K cash + timp full
**Data start:** Mai 2026

---

## 🎯 Propunerea de valoare (în 1 frază)

> "Conectezi SPV ANAF + contul tău bancar. AI-ul reconciliază automat facturile primite/emise cu plățile bancare, generează D406 (SAF-T) și îți spune săptămânal ce-ți lipsește. Pentru contabili și firme care nu vor să piardă o zi pe săptămână cu Excel."

---

## 📊 Date piață (verificate)

- e-Factura: mandatory pentru toți B2B/B2C/B2G din 1 Ian 2026
- e-Factura PFA: mandatory din 1 Iunie 2026
- SAF-T (D406): mandatory din 2025 pentru toți contribuabilii
- Tools existente (SmartBill, FGO, Saga, Oblio): emit/primesc facturi, **nu fac matching automat cu plățile**
- Total piață adresabilă: ~600K SMBs + ~600K PFAs + ~7.000 birouri contabilitate

---

## 🏗️ Stack tehnic decis

| Componentă | Alegere | De ce |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Ai deja experiență, deploy rapid |
| Backend | NestJS + Postgres (Neon) | Pattern modular = clean for QA |
| Queue | Bull + Redis (Upstash) | Reconciliere e job async |
| OCR/AI | Claude Sonnet 4.6 + Tesseract fallback | Sonnet pentru reasoning, Tesseract pentru cost |
| Bank integration | Salt Edge (€0.50-1/cont/lună) | Acoperă toate băncile RO |
| ANAF SPV | OAuth2 direct la api.anaf.ro | Documentație publică |
| Hosting | Railway sau Fly.io | €20-50/lună start |
| Auth | Stack Auth (deja folosit la CRM) | Reuse |
| Pagamente | Stripe + Netopia (pentru RON) | Stripe nu acceptă încă plăți recurente RON nativ peste tot |

**De evitat:** Microservicii, GraphQL, Kubernetes — overkill pentru MVP.

---

## ⏱️ Timeline executiv: 18 luni → €1M ARR

### **FAZA 0: Pre-launch** (zilele -30 la 0, cca. 4 săptămâni)

**Obiectiv:** Toate cele necesare legal + tehnic să poți semna un client.

| Task | Cost | Durată |
|---|---|---|
| Înființare SRL (capital 1 leu, online ONRC) | 130 RON taxe + 200 RON contabil prim trim | 7-10 zile |
| Achiziție certificat digital calificat (certSign sau DigiSign) | ~250-400 RON/an | 1-2 zile |
| Înregistrare în SPV ANAF | gratis | 1 zi |
| Creare aplicație OAuth ANAF (developer portal) | gratis | 1 zi |
| Cumpără domeniu .ro + .com | €30/an | 1 zi |
| Logo + landing minimalist (ex. v0.dev sau Tailwind UI templates) | €50-100 | 3-5 zile |
| Setup Stripe + Netopia conturi | gratis | 5 zile (validare KYC) |
| Email business + Google Workspace | €6/lună | 1 zi |
| LinkedIn + X.com profile build | gratis | 2 zile |
| Notion/Linear pentru docs interne | gratis tier | 1 zi |

**Total cost FAZA 0:** ~€600-1.000

**Livrabil:** Domeniu live cu landing page + waitlist + tu poți autentifica programatic la ANAF SPV cu certificatul tău.

---

### **FAZA 1: MVP Core Engine** (Săptămâni 1-6)

**Obiectiv:** Engine de reconciliere care funcționează end-to-end pe propriile tale date.

#### Săptămâna 1-2: Fundație
- [ ] Setup proiect monorepo (frontend + backend)
- [ ] Schema DB: `User`, `Workspace`, `Invoice`, `BankTransaction`, `MatchProposal`, `ReconciliationRun`
- [ ] Auth funcțional + workspace per cont
- [ ] CI/CD basic (GitHub Actions → Railway)

#### Săptămâna 3-4: Integrări critice
- [ ] **ANAF SPV OAuth**: download e-Factura primite + emise (lista mesaje + descărcare ZIP individual)
- [ ] **Salt Edge sandbox**: conectare la 1 bancă test, sync tranzacții
- [ ] **Upload manual** PDF/XML pentru facturi (fallback dacă SPV pică)
- [ ] **XML parser** pentru UBL 2.1 / RO_CIUS

#### Săptămâna 5-6: Engine reconciliere
- [ ] Algoritm matching: invoice ↔ payment
  - exact match (sumă + dată ±3 zile + IBAN)
  - fuzzy match (sumă±2% + dată±10 zile + similar party name)
  - consolidat (1 plată = N facturi)
- [ ] Confidence score per match (0-100)
- [ ] Dashboard simplu: "300 facturi, 240 reconciliate, 60 de revizuit"
- [ ] Export D406 (SAF-T) în XML format

**Cost dev cumulativ:** ~240-300 ore tale + €200 (hosting + APIs sandbox)

**QA milestone săptămâna 6:**
- 100 facturi de test reale (de la firma ta + 1-2 prieteni contabili)
- Target: 80%+ match accuracy automată
- 0 false positives la confidence > 90%

---

### **FAZA 2: Beta închisă** (Săptămâni 7-12)

**Obiectiv:** 5 birouri contabilitate folosesc gratis. Tu repari ce găsesc. Strângi 3 testimoniale + 5 referrals.

#### Săptămâna 7-8: Polish + onboarding
- [ ] Onboarding wizard (5 pași, max 10 minute)
- [ ] Multi-tenancy: 1 birou contabilitate = 1 workspace cu N clienți
- [ ] Email notifications (Resend, $20/lună)
- [ ] Help docs (3-5 articole de bază)

#### Săptămâna 9-12: Beta deschisă cu 5 contabili

**Cum găsești cei 5 contabili pentru beta:**
1. **CECCAR LinkedIn search** → filter by 100-500 followers (boutique firms) → 30 mesaje/săptămână
2. **Grupuri Facebook**: "Contabili România", "Antreprenori RO" → postezi întrebare "ar fi interesant un tool care reconciliează automat e-Factura cu extras bancar?" → vezi DM-urile
3. **Cold email** la 50 birouri din Cluj/Iași/Timișoara (lista din listafirme.ro filter CAEN 6920)
4. **Networking offline**: 2 evenimente CECCAR locale

**Pitch beta (în 60 secunde):**
> "Salut, mă numesc [nume]. Construiesc un tool care conectează SPV ANAF cu banca clientului tău și face matching automat. Caut 5 birouri pentru beta gratis 3 luni. În schimb îmi dai 30 min/săpt feedback și un testimonial. Te interesează?"

**Email template (cold):**
```
Subiect: 5 birouri pentru beta gratis — reconciliere e-Factura automată

Salut [Nume],

Văd că ai un birou de contabilitate cu ~[N] clienți. Întreb scurt:
cât timp pierd contabilii tăi pe matching între e-Factura și extras bancar?

Construiesc un tool care face asta automat. Caut 5 birouri pt beta gratis 3 luni.
Vrei demo 15 minute săptămâna asta?

[Link Calendly]

Mulțumesc,
[Nume]
```

**Cost FAZA 2:** ~€300 (hosting + APIs + notifications)

**Milestones FAZA 2:**
- 5 birouri active beta
- 100 facturi/săpt procesate per birou
- 3 testimoniale video (Loom screen recording, 2-3 min)
- Bug list redus la sub 10 P1/P2

---

### **FAZA 3: Primul client plătitor** (Lunile 4-5)

**Obiectiv:** Convertești 3-5 din beta în plătitori. Validezi pricing.

#### Pricing tiers (testare A/B):

| Tier | Target | Preț | Inclus |
|---|---|---|---|
| Solo PFA | PFA singular | €19/lună | 50 facturi/lună, 1 cont bancar |
| Micro SMB | SRL <10 angajați | €49/lună | 200 facturi, 2 conturi |
| Mediu SMB | SRL 10-50 ang | €99/lună | 1000 facturi, 5 conturi |
| Birou Mic | birou contabilitate <20 clienți | €399/lună | unlimited, multi-workspace |
| Birou Mare | 20+ clienți | €799/lună | + API + SLA |

**Anuali = 2 luni gratis** (incentivează cash upfront).

#### Conversion playbook
- Email beta-users ziua 75: "Am văzut că ai procesat X facturi cu noi în 90 zile. De luni trecem pe planul plătit. Iată oferta de fidelitate: -30% pentru primul an dacă semnezi anual până vineri."
- Onboarding apel 1:1 cu fiecare client convertit (15 min)
- 2 referrals incluse în contract (rebate €50 per referral plătit)

**Milestone luna 5:**
- 3-5 clienți plătiți (ideal 2 birouri × €399 + 3 SMBs × €49 = ~€950 MRR)

---

### **FAZA 4: Scale 5 → 50 clienți** (Lunile 5-9)

**Obiectiv:** €15K MRR până la finalul lunii 9.

#### Canale de achiziție prioritizate:

1. **Parteneriate cu birouri de contabilitate** (cel mai mare ROI)
   - Revenue share 20% pe primul an pentru birou care aduce client direct
   - White-label option pentru birouri mari (+€200/lună)
   - Target: 30 birouri active luna 9

2. **Content marketing tehnic în română**
   - Blog 1 articol/săpt: "Cum trimit corect D406 în 2026", "Erori comune e-Factura ANAF", "10 capcane reconciliere"
   - Țintă SEO: "reconciliere e-factura", "D406 cum se face", "matching facturi automat"
   - YouTube: 1 video/2 săpt cu screen recording demo
   - Estimated CAC: €30-80/client

3. **LinkedIn outbound personal**
   - 50 mesaje/săpt către DPO/CFO/contabili șefi din SMB-uri RO
   - ICP: SRL 20-200 ang, CAEN cu volum mare facturi (distribuție, retail, servicii B2B)

4. **Listafirme.ro / Termene.ro** integrare ușoară
   - Funnel: businessman caută "Verificare CIF" → ai widget care promit reconciliere

**Costs FAZA 4:**
- Marketing: €1.000-2.000/lună (Google Ads, LinkedIn Ads modeste)
- Content: €500/lună freelancer copywriter RO contabil
- Tools: €100/lună (Resend, Stripe fees, monitoring)
- Hosting scale: €100-200/lună
- **Total burn:** ~€2.000/lună

**Revenue luna 9 estimat:** 50 clienți mix → ~€15K MRR → **profit €13K/lună**

---

### **FAZA 5: €1M ARR** (Lunile 10-18)

**Mix realistic la luna 18:**

| Segment | Nr. clienți | ARPU | MRR |
|---|---|---|---|
| PFA | 800 | €19 | €15.200 |
| Micro SMB | 400 | €49 | €19.600 |
| Mediu SMB | 200 | €99 | €19.800 |
| Birou Mic | 80 | €399 | €31.920 |
| Birou Mare | 20 | €799 | €15.980 |
| **TOTAL** | **1.500** | — | **€102.500 MRR** |

**ARR estimat: €1.23M**

#### Investiții necesare luna 10-18:
- 1 dev full-time backend (sau outsource feature-uri specifice): €30-60K/an
- 1 customer success/onboarding part-time: €15K/an
- Marketing budget: €5K/lună (€60K/an)
- **Total OPEX an 1-2 cumulativ:** ~€150-200K
- **Burn până la break-even (luna 8-9):** ~€20-30K personal

---

## 🧪 Edge cases QA (mindset-ul tău)

| Scenariu | Risk | Mitigare |
|---|---|---|
| API ANAF SPV cade 2 zile | Sync nereușit, useri furioși | Queue cu retry exponential + status page public + manual upload fallback |
| Plată consolidată: 1 transfer = 7 facturi | Match incorect | Algorithm de subset sum + manual review obligatoriu peste threshold |
| Diferențe de centi (rounding TVA) | False mismatch | Tolerance ±0.05 RON configurabil per workspace |
| Comision bancar ascuns în plată | Sumă nu se potrivește | Detectare pattern comisione fiecare bancă RO + auto-deducere |
| User șterge accidental match-uri | Date pierdute | Soft delete + audit log immutable 90 zile |
| Certificat digital expiră | Sync se oprește silent | Alert email cu 30 zile înainte de expirare |
| GDPR: contabil dă acces la date client la angajat | Incident potențial | Permissions granulare + access log per user |
| Schimbare legislație ANAF (sigur va fi) | Tool stops working | Newsletter ANAF + dev part-time pentru upkeep |

**Test coverage minim înainte de a lua bani:** 85% pe modulul de matching (e financiar — zero toleranță).

---

## 💰 Costuri totale 18 luni (cumulativ)

| Categorie | Cost |
|---|---|
| Înființare + legal | €1.000 |
| Hosting + infra (an 1-2) | €4.000 |
| APIs (Salt Edge, Resend, Stripe fees) | €6.000 |
| Marketing | €40.000 |
| Tools dev (GitHub, Linear, Sentry) | €1.200 |
| Cont legal/contabil pentru tine | €2.400 |
| Dev contractor (lunile 10-18) | €40.000 |
| Customer success part-time (lunile 12-18) | €10.000 |
| Buffer surprize | €5.000 |
| **TOTAL CASH** | **~€110.000** |

**Self-bootstrap path:** primii 8-9 luni faci totul singur cu sub €15K cash. Apoi reinvestești cash flow-ul.

---

## ⚠️ Riscuri principale

1. **Schimbare reglementare ANAF** (probabilitate medie, impact mare): tool-ul tău depinde 100% de stabilitatea API-ului SPV. Mitigare: alertă activă pe vatupdate.com + comunitate dezvoltatori ANAF.

2. **SmartBill/FGO copiază feature-ul** (probabilitate mare în 12 luni): ei au deja distribution. Mitigare: focus pe **birouri contabilitate** ca buyer (B2B2B), nu pe SMB direct unde ei domină.

3. **Salt Edge prețuri cresc / acoperire scade**: alternative = Tink, Klarna Kosma, sau direct cu băncile (BCR, BT au PSD2 API publice).

4. **GDPR audit** (date financiare = sensitive): audit de la prim client mare poate fi costisitor. Mitigare: budget €2-3K pentru DPO consultant la luna 6.

---

## 📌 Primii 7 pași concreți (săptămâna asta)

1. ✅ Validare: 5 apeluri de 15 min cu contabili — confirm că matching e durere reală (NU sări peste!)
2. ✅ Înființare SRL online via ONRC.ro
3. ✅ Cumpără certificat digital certSign (~250 RON)
4. ✅ Înregistrează aplicație OAuth pe ANAF developer portal
5. ✅ Setup repo monorepo + Railway deploy schelet
6. ✅ Cumpără domeniu + landing page minimal cu form de waitlist
7. ✅ Postare pe LinkedIn ce construiești (build in public) → atrage primii beta-useri

---

## 🎯 Decision rule: când abandonezi?

- **Luna 3:** dacă din 5 demo-uri cu contabili, 0 spun "wow, vreau gratis" → idee invalidată, schimbă pivot
- **Luna 6:** dacă nu ai 1 plătitor după 3 luni de beta → pricing/positioning greșit, refă
- **Luna 12:** dacă MRR < €5K → schimbă canal de distribuție sau target persona

---

## 📞 Sources & resources

- ANAF SPV API docs: https://static.anaf.ro/static/10/Anaf/Informatii_R/API/Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf
- E-Factura prezentare: https://mfinante.gov.ro/static/10/eFactura/prezentare%20api%20efactura.pdf
- Exemplu OAuth PHP: https://iapp.ro/articol/exemplu-de-integrare-api-anaf-spv-php-oauth2
- Salt Edge: https://www.saltedge.com/products/account_information
- certSign: https://www.certsign.ro/
- CECCAR: https://ceccar.ro/

---

**Ultima notă:** Acest plan e un schelet, nu o lege. Adaptează la realitatea ta. Singurul KPI care contează în primele 90 zile = **5 conversații cu contabili reali**. Restul e execuție.
