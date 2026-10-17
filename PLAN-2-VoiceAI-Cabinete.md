# PLAN EXECUTIV #2 — Voice AI Receptionist pentru cabinete (RO)

**Numele de lucru:** RecepțieAI (sau alege tu)
**Target ARR an 1:** €100K MRR până în luna 12 (€1.2M ARR)
**Profil utilizator:** dev solo cu mindset QA, buget €3-5K cash + timp full
**Time-to-first-paying:** 3-4 săptămâni
**Data start:** Mai 2026

---

## 🎯 Propunerea de valoare (în 1 frază)

> "Un receptionist AI care răspunde la telefon 24/7, programează în calendar, vorbește română fluent, costă cât 1/10 din salariul unei recepționere și nu pierde niciun apel."

**Pitch în 30 secunde pentru cabinet:**
> "În medie pierzi 35% din apelurile primite (după ore, ocupat, vacanță). Fiecare apel pierdut = un pacient pierdut = €100-2.000 venit pierdut. Eu îți pun un AI care răspunde la TOATE apelurile, programează direct în calendar și costă €299/lună. Test gratis 14 zile."

---

## 📊 Date piață (verificate)

- **17.400+ cabinete stomatologice private** (ZF, 2025) — 85% în orașe
- **~12-15K cabinete medicale individuale** (INS, 2023)
- **TAM total: ~30.000 cabinete** plătitoare potențiale
- **Costuri actuale recepționistă RO**: 2.500-4.500 RON/lună brut + concedii + concedii medicale
- **Apeluri pierdute**: 30-40% în industria medicală (benchmark global)
- **LTV pacient stomatologic**: €100-2.000 (curățare → implant)

**Competitori RO:** aproape ZERO. Goodcall/Dialzara/Synthflow nu au română nativă.

---

## 🏗️ Stack tehnic decis

| Componentă | Alegere | De ce | Cost |
|---|---|---|---|
| Voice AI platform | **Vapi.ai** | $0.05/min base, cea mai stabilă, suportă orice TTS | $0.05/min |
| TTS (voce) | **ElevenLabs** voci RO sau **Azure Speech** RO | ElevenLabs e mai natural; Azure mai ieftin | ~$0.08-0.15/min |
| STT (recunoaștere) | **Deepgram Nova-2** RO sau Azure | Bun pe română | ~$0.01/min |
| LLM | **Claude Sonnet 4.6** sau **GPT-4o** | Sonnet e mai bun la role-play medical | ~$0.05/min conversație |
| Telefonie | **Twilio** numere RO | Stabilitate + numere RO disponibile | ~€5/lună/număr + €0.02-0.04/min |
| Backend | NestJS + Postgres (Neon) | Pattern modular | €25/lună |
| Dashboard | Next.js | Reuse skill | €0 (Vercel free tier) |
| Calendar sync | Google Calendar API + Microsoft Graph | 80% cabinete folosesc gmail | gratis |
| Software medical RO | Direct integration cu Hipocrate, Medicalis, Clinicilor (cele mai populare) | Diferențiator local | timp dev |

**Total cost variabil per minut conversație:** ~$0.25-0.35/min
**Apel mediu cabinet:** 90 secunde
**Apeluri/lună/cabinet medie:** 200-400
**Cost variabil/cabinet/lună:** €25-65 → marjă brută ~80% pe €299/lună

---

## ⏱️ Timeline executiv: 12 luni → €1M ARR

### **FAZA 0: Pre-launch** (Săptămâna 0)

**Obiectiv:** Toate conturile + 1 număr RO funcțional.

| Task | Cost | Durată |
|---|---|---|
| Înființare SRL (online ONRC) | 130 RON | 7-10 zile (poate paralel cu dev) |
| Cont Vapi.ai (free trial $10) | gratis | 30 min |
| Cont Twilio + cumpără 1 număr RO local | $5/lună + $20 trial | 1 oră |
| Cont ElevenLabs Pro (sau Starter) | $22-99/lună | 30 min |
| Cont Deepgram | pay-as-you-go | 30 min |
| Cont Claude API + OpenAI API | pay-as-you-go | 30 min |
| Domeniu + landing simplu | €30/an | 2-3 zile |
| Conturi Google Workspace + LinkedIn business | €6/lună | 1 zi |

**Total cost FAZA 0:** ~€200-400

---

### **FAZA 1: MVP funcțional** (Săptămâni 1-4)

**Obiectiv:** AI care răspunde corect la 90% scenarii într-un cabinet stomato.

#### Săptămâna 1: Voice agent v0
- [ ] Setup Vapi assistant cu prompt template "recepționer cabinet stomatologic"
- [ ] Integrare ElevenLabs voce română (testează 5-10 voci, alege 1 caldă feminină + 1 masculină)
- [ ] Twilio number → Vapi inbound flow
- [ ] Test: tu suni de la 5 numere diferite → AI răspunde cu accent decent

**Sample prompt assistant (production-ready start):**
```
Ești recepționera cabinetului stomatologic [Nume Cabinet] din [Oraș].
Vorbești română fluent, calm, profesional, cu empatie.
Programul cabinetului: Luni-Vineri 9:00-19:00, Sâmbătă 9:00-13:00.

Sarcinile tale:
1. Răspunzi la întrebări despre servicii (curățare, plombă, implant, albire).
2. Programezi pacienți în calendar (folosește tool: book_appointment).
3. Confirmi programări existente (tool: lookup_appointment).
4. Reprogramezi sau anulezi (tool: reschedule_appointment).
5. La URGENȚE (durere severă, sângerare, traume), spui calm: "Vă transfer imediat la medicul de gardă" → tool: transfer_call.

REGULI ABSOLUTE:
- NU dai sfaturi medicale. NICIODATĂ. La orice întrebare medicală: "Pentru asta aș prefera să vă răspundă direct doctorul, putem programa o consultație?"
- NU promiți preț fix la lucrări complexe (implant, ortodonție). Spui: "Prețul exact se stabilește la consultație, costul consultației este [X] lei."
- La urgență REALĂ (durere piept, leșin, accident, sângerare puternică) → IMEDIAT transfer + spui pacientului "sunați la 112 dacă e urgență vitală".
- Dacă pacientul e nervos/insistă: "Înțeleg perfect, să programăm urgent pentru..." NU intri în ceartă.
- Dacă nu înțelegi cererea după 2 încercări: "Vă fac legătura cu un coleg, un moment vă rog" → transfer.

Stil vorbire:
- Propoziții scurte, clare.
- Nu folosi anglicisme.
- Salut: "Bună ziua, ați sunat la cabinetul [Nume]. Cu ce vă pot ajuta?"
- Final: "Mulțumim că ne-ați contactat, o zi bună!"
```

#### Săptămâna 2: Tools & integrări
- [ ] Tool `book_appointment` → Google Calendar API event create
- [ ] Tool `lookup_appointment` → search Google Calendar
- [ ] Tool `transfer_call` → Twilio dial mobil medic
- [ ] Tool `send_sms_confirmation` → Twilio SMS RO
- [ ] DB: cabinete, calendare, apeluri (înregistrare + transcript), sloturi

#### Săptămâna 3: Dashboard cabinet
- [ ] Login cabinet (Stack Auth)
- [ ] Pagina "Apeluri" — listă cu transcript + recording + outcome (programat/transferat/info)
- [ ] Pagina "Programări" — calendar embed + status sync
- [ ] Pagina "Setări" — orare, doctori, prețuri standard, prompt customizable
- [ ] Pagina "Statistici" — apeluri/zi, programări reușite, urgențe transferate

#### Săptămâna 4: Hardening + testare RO
- [ ] **Testare pe 30 voci diferite** (familie, prieteni, accente regionale)
- [ ] **Scenarii test obligatorii** (vezi secțiunea QA)
- [ ] Recording opt-in cu disclaimer GDPR în salutul inițial
- [ ] Setup Vercel/Railway production deploy
- [ ] Status page public (status.recepție.ai sau similar)

**Cost dev cumulativ:** ~120-180 ore
**Cost cash:** ~€500 (pentru testare + tools)

**Milestone săptămâna 4:** Tu poți face demo live unui cabinet din primul tău oraș și aiăl convingător.

---

### **FAZA 2: Primul demo + primul plătitor** (Săptămâni 5-8)

**Obiectiv:** 5 cabinete plătitoare la finalul săptămânii 8.

#### Săptămâna 5: Pre-vânzare (lista + materiale)

**Lista 50 cabinete țintă (start):**
- Filtru CAEN 8623 (stomatologie) pe listafirme.ro
- Filtru oraș: orașul tău + 1 oraș vecin
- Filtru: minim 3 medici (ai banii) sau "lanț 2-3 cabinete"
- Excludere: lanțuri mari (Dent Estet, Dr. Leahu) — sales cycle prea lung

**Demo kit:**
- [ ] Calculator ROI Excel/Notion (vezi mai jos)
- [ ] Video demo de 90 sec — telefon real → AI răspunde + programare
- [ ] One-pager PDF cu prețuri și beneficii
- [ ] Calendly link pentru demo 20 min
- [ ] Contract scurt (1 pagină) + GDPR addendum

**ROI Calculator (input cabinet → output economii):**

| Input | Default |
|---|---|
| Apeluri primite/zi | 15 |
| % apeluri pierdute (după ore + ocupat) | 35% |
| Apeluri pierdute/lună | ~140 |
| % apeluri = pacienți noi potențiali | 40% |
| Pacienți noi pierduți/lună | 56 |
| Conversie apel → programare | 50% |
| Programări noi pierdute/lună | 28 |
| Valoare medie pacient nou (1ª vizită) | 250 RON |
| **Pierdere medie/lună** | **7.000 RON / €1.400** |
| Cost AI receptionist | 1.500 RON / €299/lună |
| **Economie netă/lună** | **5.500 RON / €1.100** |

#### Săptămâna 6: Outreach + demo-uri

**Strategia: 30 cabinete contactate → 10 demo → 3-5 trial.**

**Pitch telefonic (cold) — 60 sec:**
> "Bună ziua, sunt [Nume]. Sun să întreb scurt — câte apeluri pierdute aveți pe zi când recepționera e ocupată sau după program? [pauză] Construiesc un sistem AI care răspunde 24/7 în română, programează direct în calendarul vostru și costă cât o jumătate de zi de recepționer pe lună. Pot face un demo live de 10 minute săptămâna viitoare?"

**Email outreach (alternative pentru cei care nu răspund la telefon):**
```
Subiect: [Nume cabinet] — receptionist AI 24/7 în română (test gratuit)

Bună ziua dr. [Nume],

Întreb direct: cât valorează 30-50 apeluri pierdute pe lună
de la pacienți noi care vă găsesc pe Google după ore?

Construiesc un AI care răspunde la TOATE apelurile, în română,
și programează direct în calendarul cabinetului.

Demo live (sun eu, dvs. ascultați AI-ul vorbind) — 10 minute.

Pot săptămâna viitoare? [link Calendly]

Cu respect,
[Nume]
[Mobil]
```

**Demo în-persoană sau video call (20 min):**
1. (3 min) Întrebări despre cabinet — câte apeluri/zi, cum gestionează acum
2. (5 min) Tu suni de la mobil la numărul demo, ei ascultă AI
3. (2 min) Tu programezi un apel "fictiv" → ei văd intrarea în calendar
4. (3 min) Edge case: tu spui "mă doare pieptul tare" → AI transferă imediat
5. (5 min) ROI calculator personalizat
6. (2 min) Ofertă: trial 14 zile gratis, fără card. Dacă le place → €299/lună.

#### Săptămâna 7-8: Trial → conversie

**Setup trial pentru 1 cabinet:**
- Tu cumperi 1 număr Twilio nou pentru ei
- Configurezi prompt customizat (orare, prețuri, doctori, servicii)
- Forwarding: cabinetul setează call forwarding pe numărul tău când e ocupat sau după ore
- Daily check-in zilele 1-3, weekly după
- Ziua 12: "Mâine se termină trial-ul, să continuăm?"

**Target săptămâna 8:** 5 cabinete × €299 = €1.495 MRR

**Cost FAZA 2:** ~€500 marketing + €100 demo number + costuri variabile testare €200

---

### **FAZA 3: Scale 5 → 30 cabinete** (Lunile 3-5)

**Obiectiv:** €9K MRR la finalul lunii 5.

#### Canale de achiziție:

1. **Referrals (cel mai bun ROI)**
   - Fiecare cabinet plătitor primește -€50/lună pentru fiecare referral plătitor adus
   - Email automat după 30 zile: "Cunoști 2 colegi medici care ar profita?"

2. **Asociații profesionale**
   - Colegiul Medicilor Stomatologi din România (CMSR) — newsletter sponsor + standuri la conferințe
   - Asociații locale (ex. Asociația Stomatologilor Cluj)
   - Cost: €500-2.000/eveniment, dar 10-30 demo-uri/eveniment

3. **Google Ads local**
   - Keywords: "recepționer stomatologic", "preluare apeluri cabinet"
   - Geo: top 10 orașe RO
   - CPC estimat: €0.5-2

4. **YouTube Shorts / TikTok**
   - 1 video/săpt: "Cum sună AI-ul care răspunde la cabinetul stomato" — viral potential mare
   - Hashtags: #medicromania #stomatologie #cabinetmedical

5. **LinkedIn personal**
   - Build in public: postare săptămânală cu progres + transcripts apeluri reușite (cu acordul cabinetului)

**Cost lunar marketing:** €1.500-3.000

#### Operaționale (lunile 3-5):
- Onboarding 4 cabinete/lună (max ce poți gestiona singur)
- Each onboarding: 1 oră prompt customization + 30 min training cabinet
- Customer support: WhatsApp Business cu răspuns < 4h
- Status page + alert pe Slack când AI eșuează

**Milestone luna 5:** 30 cabinete × €299 = ~€9K MRR

---

### **FAZA 4: Scale 30 → 100 cabinete** (Lunile 6-9)

**Obiectiv:** €30K MRR la finalul lunii 9.

#### Investiții necesare:
- **1 onboarding specialist** (€1.500-2.000/lună) — face setup-urile, eliberează tu
- **Multi-tenant prompt builder** UI — cabinetul își poate configura singur prompt-ul
- **Integrări native** cu top 3 softuri medicale RO (Hipocrate, Medicalis, Clinicilor) — diferențiator masiv
- **Self-service onboarding** — cabinet poate semna online + setup în 20 min fără tine

#### Tier nou: Voice AI pentru cabinete medicale (non-stomato)
- Family doctor, ginecologie, cardiologie etc.
- Prompts diferite + tools diferite (rețete reînnoite, rezultate analize, programare consult)
- Pricing similar €199-399/lună

#### Tier Premium: lanțuri 3-10 cabinete
- €799-1.499/lună (multi-location dashboard + reporting consolidat)
- Țintă: 5-10 lanțuri în 4 luni

**Milestone luna 9:** 100 cabinete în mix → ~€30K MRR

---

### **FAZA 5: €1M ARR** (Lunile 10-12)

**Mix realistic la luna 12:**

| Segment | Nr. cabinete | ARPU | MRR |
|---|---|---|---|
| Stomatologie solo | 200 | €299 | €59.800 |
| Stomatologie multi-doctor | 80 | €499 | €39.920 |
| Medicale individuale | 50 | €299 | €14.950 |
| Lanțuri (3-10) | 10 | €1.299 | €12.990 |
| **TOTAL** | **340** | — | **€127.660 MRR** |

**ARR estimat: ~€1.53M**

#### Investiții luna 10-12:
- 1 dev part-time (€20K an): integrări noi + bug fixes
- 1 sales rep RO (€2.5K/lună + comision): pentru lanțuri
- Marketing: €5K/lună
- **Total OPEX:** ~€10-15K/lună

**Profit estimat luna 12:** €110K MRR - €15K OPEX = ~€95K/lună profit operațional

---

## 🧪 Edge cases QA — OBLIGATORII

Acestea trebuie testate **înainte** de primul client plătitor.

### 1. Urgențe medicale (CEL MAI CRITIC)

| Trigger | Răspuns așteptat |
|---|---|
| "Mă doare pieptul tare" | Transfer imediat + "sunați la 112 dacă e urgență" |
| "Sângerează puternic, nu se oprește" | Transfer imediat + 112 |
| "Am leșinat / leșin" | Transfer imediat + 112 |
| "Soțul a căzut, nu răspunde" | "Sunați IMEDIAT la 112" + transfer |
| "Mă doare măseaua de 3 zile" | Programare urgentă în 24h, NU transfer |
| "Mi-a căzut o plombă" | Programare în 2-3 zile, NU urgență |

**Test obligatoriu:** 50 scenarii urgență, AI trebuie să fie 100% corect pe escalation.

### 2. Acccente regionale & calitate audio

| Test | Rezultat țintă |
|---|---|
| Vorbitor moldovenesc cu accent | înțelegere ≥90% |
| Vorbitor ardelenesc | înțelegere ≥90% |
| Vorbitor bănățean | înțelegere ≥90% |
| Vorbitor în vârstă (peste 70) | înțelegere ≥80%, viteză vorbire AI redusă |
| Apel din mașină (zgomot trafic) | înțelegere ≥75% sau "vă rog repetați" |
| Telefon prost (linie zgomotoasă) | escalation la cuvinte cheie |

### 3. Edge cases comportamentale

| Scenariu | Răspuns așteptat |
|---|---|
| Pacient nervos înjură | calm, "înțeleg frustrarea, vă programez urgent..." |
| Pacient vrea să vorbească cu medicul direct | "doctorul e cu un pacient, vă pot programa apel" |
| Pacient cere să-i citească prețul exact pt implant | NU citește preț complex; "se stabilește la consultație" |
| Apelant vrea să vândă ceva (telesales) | recunoaște + termină politicos |
| Apel mut/silence > 5 sec | "Mă auziți? Apelul se închide." |
| Pacient minor (sub 18) cere programare | "este nevoie de acordul părintelui, îl chemați?" |
| Pacient cere date despre un alt pacient (rudă) | refuză GDPR, dar politicos |

### 4. Tehnice

| Risc | Mitigare |
|---|---|
| Vapi cade 2 ore | Failover cu Retell.ai sau redirect la mobil cabinet |
| Twilio număr suspendat | Backup număr standby |
| Google Calendar API rate limit | Batch + retry queue |
| Cabinet schimbă orarul, uită să updateze prompt | Auto-pull din calendar = single source of truth |
| Recording GDPR — pacient cere ștergerea | Self-service în dashboard, soft delete + 30 zile hard delete |
| AI hallucinates preț greșit | Prețuri în prompt = obligatoriu sau "verificăm la consultație" |

---

## 💰 Costuri totale 12 luni

| Categorie | Cost cumulativ |
|---|---|
| Înființare + legal | €700 |
| Vapi credits primii 6 luni | €2.000 |
| Twilio (numere + traffic) | €3.000 |
| ElevenLabs Pro 12 luni | €1.200 |
| Deepgram + LLM API | €4.000 |
| Hosting + infra | €1.500 |
| Domeniu + emails | €200 |
| Tools dev (Sentry, Linear) | €600 |
| Marketing & demo | €25.000 |
| Onboarding specialist (lunile 6-12) | €12.000 |
| Sales rep (lunile 10-12) | €9.000 |
| Buffer | €5.000 |
| **TOTAL CASH 12 LUNI** | **~€64.000** |

**Self-bootstrap:** primii 4-5 luni faci totul singur, sub €5K cash. Apoi reinvestești cash flow.

---

## ⚠️ Riscuri principale

1. **Voice AI se commodifică în 18 luni** (probabilitate mare): Gpt-realtime, Vapi, Retell competiție brutală. Mitigare: focus pe **localizare RO + integrări medicale RO** ca moat. Nu pe tehnologia voice în sine.

2. **Reglementare medicală** (probabilitate medie): Colegiul Medicilor poate emite reguli despre "AI în comunicarea cu pacientul". Mitigare: monitorizare CMR + disclaimer clar "asist administrativ, nu dau sfaturi medicale".

3. **Cabinet nu vrea să schimbe call forwarding** (frecvent): "ce se întâmplă dacă pică?" Mitigare: trial gratuit + status page public + 24h support.

4. **Calitatea voce ElevenLabs RO scade vs. competiție**: testează lunar Azure + alternative + backup cu OpenAI realtime când lansează RO bun.

---

## 📌 Primii 7 pași concreți (săptămâna asta)

1. ✅ Cont Vapi.ai + Twilio + ElevenLabs (toate trial gratis)
2. ✅ Cumpără 1 număr RO Twilio (€5)
3. ✅ Construiește assistant Vapi cu prompt-ul de mai sus + voce ElevenLabs
4. ✅ Sună de la mobil → AI răspunde — verifică experiența
5. ✅ Listează 30 cabinete stomato din orașul tău (listafirme.ro)
6. ✅ Înregistrează video demo de 90 sec
7. ✅ Trimite 10 mesaje pe LinkedIn + 5 emailuri reci → primul demo în 7-10 zile

---

## 🎯 Decision rule: când abandonezi?

- **Săptămâna 4:** dacă din 10 demo-uri, 0 spun "vreau trial gratis" → pitch sau produs greșit, refă
- **Luna 3:** dacă nu ai 5 plătitori → pricing prea mare sau target persona greșit
- **Luna 6:** dacă MRR < €5K → schimbă canal sau abandonează idea

---

## 📊 KPIs urmărite zilnic/săptămânal

| KPI | Țintă luna 1 | Țintă luna 6 | Țintă luna 12 |
|---|---|---|---|
| Cabinete trial active | 5 | 30 | — |
| Cabinete plătite | 3 | 25 | 340 |
| MRR | €600 | €7.5K | €127K |
| Trial → paid conversion | 50% | 60% | 70% |
| Churn lunar | <10% | <5% | <3% |
| Apeluri procesate/zi | 50 | 1.500 | 30.000 |
| Urgențe corect escaladate | 100% | 100% | 100% |
| NPS | >40 | >50 | >60 |

---

## 📞 Sources & resources

- Vapi.ai pricing: https://vapi.ai/pricing
- Twilio Romania voice pricing: https://www.twilio.com/en-us/voice/pricing/ro
- ElevenLabs voci RO: https://elevenlabs.io/voice-library
- Deepgram limbi suportate: https://developers.deepgram.com/docs/models-languages-overview
- Listafirme.ro (lead generation): https://listafirme.ro
- CMSR (Colegiul Medicilor Stomatologi): https://cmsr.ro
- Pacienți pierduți statistici: https://www.zf.ro/companii/romania-peste-17-400-cabinete-stomatologice-dintre-85-oras-31-22882216

---

**Ultima notă:** Acest plan poate da primul cash în 30 de zile. Singurul KPI care contează în săptămâna 1 = **un cabinet care testează AI-ul tău**. Mergi fizic la 5 cabinete dacă trebuie. Demo live > orice landing page.
