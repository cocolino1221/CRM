# PLAN EXECUTIV #3 — AdminAI: Document Delivery Agent pentru Primării + Medical (Hibrid 36 luni)

**Numele de lucru:** AdminAI (sau alege tu)
**Țintă ARR luna 36:** €1.5-2.5M ARR (mix primării + medical)
**Profil utilizator:** dev solo cu mindset QA, capabil să gestioneze stack tehnic complex
**Buget cash anul 1:** €15-25K (parțial recuperabil din cash flow medical)
**Data start:** Mai 2026

---

## 🎯 Teza strategică

**O singură platformă, două piețe care se finanțează reciproc.**

- **Medical** (laboratoare, cabinete) = motor de cash flow rapid (4-8 săptămâni MVP, primii bani luna 2)
- **Primării** = motor de scale long-term (luna 9-36, contracte mari, defensibility maximă)

Platforma e identică tehnic: agent AI care autentifică un cetățean/pacient și livrează documentele LUI pe canalul preferat (WhatsApp/voce/email).

**Cheia:** construim arhitectura multi-vertical de la zero. La luna 6, pornim verticala primării FĂRĂ să rescriem nimic.

---

## 📊 De ce acum (date reci)

### Primării
- **3.181 primării** în România
- **PNRR Componenta C7 = €1.88 miliarde** dedicate transformării digitale (Investiția I18 specifică pentru administrație publică)
- **Deadline plăți PNRR: decembrie 2026** → primăriile au URGENȚĂ să cheltuiască fondurile aprobate
- **Indeco Soft (SICO) are 1.000+ instituții publice** ca clienți — incumbent dominant, dar fără concurent serios pe stratul AI agent
- **ROeID a fost lansat în 2025**, integrare cu Ghișeul.ro deja funcțională, în curs de extindere EU-wide
- **Sigiliu electronic calificat** = mecanism legal recunoscut eIDAS, costă €100-300/an

### Medical
- 17.400 cabinete stomatologice + ~30K cabinete medicale + top 10 lanțuri de laboratoare
- Vezi Plan #2 și Plan #4 pentru detalii medical

### Convergența
- Ambele piețe au URGENȚĂ digitală în 2026
- Ambele plătesc pentru ROI clar (reducere personal admin, viteză livrare)
- Ambele cer autentificare puternică = ROeID rezolvă pentru ambele

---

## 🗺️ Plan strategic 36 luni

### Orizont 1: Lunile 1-6 — Validare + Cash flow medical
**Obiectiv:** €15-25K MRR din lab-uri medicale, platformă multi-vertical funcțională

- **Lunile 1-3:** MVP medical (laboratoare) + arhitectură multi-tenant ready pentru orice verticală
- **Lunile 3-5:** Primii 3-5 lab-uri/cabinete plătite
- **Luna 6:** €15-25K MRR medical + 1 primărie identificată ca pilot

### Orizont 2: Lunile 6-18 — Pilot primărie + scale medical
**Obiectiv:** Primul cash flow primărie + €40-60K MRR total

- **Lunile 6-9:** Pilot gratuit cu 1 primărie comună mică (5-15K locuitori)
- **Lunile 9-12:** Caz de succes documentat + 3 primării plătite (achiziție directă <€30K)
- **Lunile 12-18:** Scale primării 3 → 15 + medical 5 → 20 clienți

### Orizont 3: Lunile 18-36 — Primării devin motor principal
**Obiectiv:** €1.5-2.5M ARR

- **Lunile 18-24:** Aplici la proiecte PNRR ca furnizor calificat, primă licitație publică câștigată
- **Lunile 24-36:** 50+ primării active + 5-10 orașe medii + 2-3 municipii
- **Posibil exit/strategic raise:** acquisition de către Indeco/Wizrom sau scale-up cu funding €1-3M

---

## 🛠️ MVP — Scope ruthlessly redus

### Ce e ÎN MVP (8-12 săptămâni dev)

1. **WhatsApp bot pentru 1 primărie pilot** (limba română exclusiv)
2. **3 tipuri de documente** auto-generate + semnate cu sigiliu electronic primărie:
   - Certificat fiscal (atestare debite locale)
   - Adeverință de domiciliu
   - Situație impozite + link plată
3. **Autentificare Tier 2** (CNP + nume + OTP la nr. telefon din DB primărie)
4. **Connector primărie** (Docker container) — citește read-only din SICO/Wizrom
5. **Cloud platform** — orchestrator AI + delivery + audit log
6. **Dashboard primărie** — vizualizează cereri, status, rapoarte zilnice

### Ce NU e în MVP (vine la luna 4+)
- ❌ Voice AI (telefon)
- ❌ Web portal cetățean self-service
- ❌ Mobile app
- ❌ Plata online integrată (link direct la ghișeul.ro doar)
- ❌ Documente urbanism complexe
- ❌ Acordurile părinte-copil (manual escalation)
- ❌ ROeID integration (Tier 3) — vine la luna 6
- ❌ Multi-primărie din MVP (1 singur pilot)

### Success criteria MVP (luna 3)
- 100+ documente generate cu succes
- 0 documente livrate la persoană greșită
- < 60 secunde timp mediu cerere → livrare
- Funcționar primărie spune "ar fi păcat să-l pierdem"
- Cetățeni: NPS > 50

---

## 🏗️ Arhitectura tehnică — partea cea mai importantă

### Realitatea IT a primăriilor (brutal de onestă)

| Sistem | Vendor | Market share RO | Acces tehnic |
|---|---|---|---|
| **SICO** (modulele TIL, Buget, Stare Civilă, Urbanism) | Indeco Soft | 70%+ (1.000+ instituții) | SQL Server on-prem; API REST în v9+, doar SQL în versiuni vechi |
| **Wizrom Public** | Wizrom Software | ~15% | Oracle/SQL Server, API mai deschis |
| **CAPS Soft, Allevo, CGM, SOBIS** | diverse | ~10% | regional, mixt |
| **Excel/Access/hârtie** | — | ~5% | manual, fallback OCR |
| **Stare Civilă (SIIEASC)** | DEPABD național | toate | acces federal, separat |
| **Cadastru (ANCPI)** | național | toate | API ANCPI separat |

**Concluzia critică:** Nu există o singură integrare. Trebuie strategie pe pași:
1. Începi cu **read-only DB access** la SICO (acoperă 70% piață)
2. Adaugi **Wizrom API** (acoperă 85%)
3. Adaugi **fallback manual upload** (acoperă 100%)

### Arhitectura propusă: Hybrid Connector + Cloud

```
┌────────────────────────────────────────────────────────┐
│           PRIMĂRIA (rețea internă, on-prem)            │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  SICO    │  │  Wizrom  │  │ Excel/   │            │
│  │ MS SQL   │  │  Oracle  │  │ Manual   │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       └─────────────┼──────────────┘                   │
│                     │                                   │
│         ┌───────────▼──────────────┐                   │
│         │   AdminAI Connector      │                   │
│         │   (Docker container)     │                   │
│         │                          │                   │
│         │  • Read-only DB user     │                   │
│         │  • Schedule sync (5 min) │                   │
│         │  • Document gen LOCAL    │                   │
│         │  • Sigiliu electronic    │                   │
│         │  • Encrypt + push cloud  │                   │
│         └───────────┬──────────────┘                   │
└─────────────────────┼─────────────────────────────────┘
                      │
                      │ TLS 1.3 + mTLS + IP allowlist
                      ▼
┌────────────────────────────────────────────────────────┐
│             CLOUD AdminAI (Hetzner Frankfurt EU)       │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Tenant Cache DB  │  │ AI Orchestrator  │          │
│  │ (Postgres)       │  │ (Claude + tools) │          │
│  │ - Encrypted      │  │ - Multi-step     │          │
│  │ - Per-tenant key │  │ - Tool calling   │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Identity Hub     │  │ Audit Log        │          │
│  │ - ROeID (faza 2) │  │ - Immutable      │          │
│  │ - SPV ANAF       │  │ - 5y retention   │          │
│  │ - SMS OTP        │  │ - Hash chain     │          │
│  └──────────────────┘  └──────────────────┘          │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Delivery Layer   │  │ Compliance       │          │
│  │ - WhatsApp       │  │ - DSAR auto      │          │
│  │ - SMS            │  │ - Export GDPR    │          │
│  │ - Email          │  │ - DPO dashboard  │          │
│  └──────────────────┘  └──────────────────┘          │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
                    CETĂȚEANUL
              (WhatsApp / SMS / email)
```

### De ce Connector + Cloud (nu cloud direct)

**Argumente legal/security:**
- **Date personale stau fizic în primărie** → GDPR mult mai relaxat
- **Sigiliul electronic primărie nu părăsește locația** → integritate juridică maximă
- **Audit local + audit cloud** → dublă protecție
- **Failover natural:** dacă cloud cade, connectorul continuă să funcționeze cu cache local

**Argumente sales:**
- "Datele NU pleacă din primărie" = pitch puternic la primar/IT
- Conformitate cu cerințele PNRR (data sovereignty)
- Soluție agreabilă cu DPO-ul primăriei

### Connector — specificație tehnică

**Stack:**
- **Limbaj:** Node.js + TypeScript (consistent cu CRM-ul tău)
- **Containerizare:** Docker (1 imagine, deploy în orice primărie cu Docker)
- **DB clients:** mssql, oracledb, pg (multi-DB support)
- **PDF gen:** pdf-lib + signpdf (pentru semnare electronică)
- **Comunicare cloud:** axios + JWT cu rotație 1h
- **Storage local:** SQLite pentru cache + audit log local

**Configurare per primărie (docker-compose.yml):**
```yaml
version: '3.8'
services:
  adminai-connector:
    image: adminai/connector:1.0.0
    restart: always
    environment:
      - PRIMARIE_SIRUTA=58124  # codul SIRUTA al primăriei
      - SICO_VERSION=v8        # v7, v8, v9_api
      - SICO_HOST=10.0.5.10
      - SICO_PORT=1433
      - SICO_USER=adminai_ro
      - SICO_PASSWORD_FILE=/secrets/sico_pwd
      - WIZROM_HOST=
      - CLOUD_API=https://api.adminai.ro
      - CLOUD_TENANT_ID=PRM_58124
      - CLOUD_TENANT_KEY_FILE=/secrets/tenant_key
      - SIGILIU_CERT_FILE=/certs/sigiliu_p12.pfx
      - SIGILIU_CERT_PASSWORD_FILE=/secrets/sigiliu_pwd
    volumes:
      - ./secrets:/secrets:ro
      - ./certs:/certs:ro
      - connector_data:/data
    networks:
      - primarie_internal
volumes:
  connector_data:
networks:
  primarie_internal:
    external: true
```

**Interfețe TypeScript principale (de copy-paste în implementare):**

```typescript
// Adapter pattern pentru orice sistem primărie
export interface PrimarieAdapter {
  type: 'SICO_v7' | 'SICO_v8' | 'SICO_v9_API' | 'WIZROM' | 'MANUAL';
  
  // Read operations
  getCitizen(cnp: string): Promise<CitizenRecord | null>;
  getFiscalStatus(cnp: string, year?: number): Promise<FiscalStatus>;
  getPendingApplications(cnp: string): Promise<Application[]>;
  getResidenceProof(cnp: string): Promise<ResidenceData>;
  
  // Health
  testConnection(): Promise<{ ok: boolean; lag_ms: number }>;
}

// Implementări concrete
export class SICOv8Adapter implements PrimarieAdapter {
  type = 'SICO_v8' as const;
  constructor(private dbConfig: SICOConfig) {}
  
  async getCitizen(cnp: string): Promise<CitizenRecord | null> {
    const result = await this.queryWithRetry(`
      SELECT cnp, nume, prenume, adresa, telefon, email
      FROM Persoane_Fizice 
      WHERE cnp = @cnp AND activ = 1
    `, { cnp });
    
    return result[0] ? this.mapToCitizen(result[0]) : null;
  }
  
  async getFiscalStatus(cnp: string, year = new Date().getFullYear()): Promise<FiscalStatus> {
    const debits = await this.queryWithRetry(`
      SELECT tip_impozit, suma_anuala, scadenta, restant_total
      FROM Roluri_Fiscale 
      WHERE cnp = @cnp AND an_fiscal = @year
    `, { cnp, year });
    
    return {
      cnp,
      year,
      hasOutstandingDebt: debits.some(d => d.restant_total > 0),
      totalDebt: debits.reduce((sum, d) => sum + d.restant_total, 0),
      lines: debits,
      generatedAt: new Date()
    };
  }
  // ... etc
}

// Document generator (rulează LOCAL în connector)
export class DocumentGenerator {
  constructor(
    private adapter: PrimarieAdapter,
    private signer: ElectronicSealSigner
  ) {}
  
  async generateFiscalCertificate(
    request: FiscalCertificateRequest
  ): Promise<SignedDocument> {
    // 1. Verifică citizen exists
    const citizen = await this.adapter.getCitizen(request.cnp);
    if (!citizen) throw new CitizenNotFoundError(request.cnp);
    
    // 2. Get fiscal data
    const fiscal = await this.adapter.getFiscalStatus(request.cnp);
    
    // 3. Generate PDF cu template oficial
    const pdfBytes = await this.renderTemplate('certificat_fiscal', {
      citizen,
      fiscal,
      primarie: this.config.primarieMeta,
      issueDate: new Date(),
      validUntil: addDays(new Date(), 30)
    });
    
    // 4. Semnează cu sigiliul electronic primărie
    const signedPdf = await this.signer.sign(pdfBytes);
    
    // 5. Return cu metadata
    return {
      document: signedPdf,
      mimeType: 'application/pdf',
      filename: `Certificat_Fiscal_${request.cnp}_${formatDate(new Date())}.pdf`,
      hash: sha256(signedPdf),
      signedAt: new Date(),
      validUntil: addDays(new Date(), 30),
      auditId: uuidv4()
    };
  }
}
```

### Cloud platform — endpoint principale

```typescript
// API REST pentru cetățean (via WhatsApp bot frontend)
POST   /api/v1/citizen/auth/start         { cnp, primarie_id }
POST   /api/v1/citizen/auth/verify-otp    { session_id, otp }
GET    /api/v1/citizen/documents/types    -> lista cu ce poate cere
POST   /api/v1/citizen/documents/request  { type, params } -> async job
GET    /api/v1/citizen/documents/:id      -> download dacă e gata

// Webhook din connector
POST   /api/v1/connector/sync             // push încriptat de date
POST   /api/v1/connector/document/ready   // notify când doc e generat
GET    /api/v1/connector/jobs/pending     // pull jobs din coadă

// Dashboard primărie (web)
GET    /api/v1/primarie/dashboard
GET    /api/v1/primarie/audit-log
POST   /api/v1/primarie/document/manual    // funcționar generează manual
```

### Authentication — modelul pe tier-uri

| Tier | Documente | Metodă auth | MVP? |
|---|---|---|---|
| **Tier 0** | Info publică, FAQ, status program | Niciuna | ✅ |
| **Tier 1** | Status dosar, programare ghișeu | CNP + nume (slab, dar OK) | ✅ |
| **Tier 2** | Certificat fiscal, adeverință domiciliu, situație impozite | CNP + nume + OTP la nr. tel din DB primărie | ✅ |
| **Tier 3** | Plată impozite, autorizații | ROeID OR SPV ANAF login | ⏳ luna 6 |
| **Tier 4** | Documente sensibile, semnare contract | ROeID + biometric live | ⏳ luna 12 |

**Cheia Tier 2:** OTP-ul NU se trimite la numărul WhatsApp curent. Se trimite la numărul primăriei are în baza de date pentru CNP-ul respectiv. Dacă cineva încearcă să ia documentul altcuiva, OTP-ul ajunge la proprietar real.

**Edge case:** Dacă numărul din DB primărie e vechi/nu mai funcționează → fallback "veniți la primărie să actualizați datele" (NU compromiti security).

---

## 🔐 Reglementare — checklist BEFORE prima linie de cod

### Acte și înregistrări

- [ ] **Înființare SRL** (online ONRC, ~130 RON taxe + 200 contabil)
- [ ] **Înregistrare ANSPDCP ca processor** (gratis, online)
- [ ] **Înregistrare SEAP** (Sistemul Electronic Achiziții Publice — necesar pentru a vinde la primării; gratis dar lent ~2-4 săpt)
- [ ] **Cumpără sigiliu electronic CALIFICAT pentru AdminAI SRL** (Namirial €150-300/an SAU certSign €100-250/an)
- [ ] **Cumpără certificat digital semnătură electronică pentru tine personal** (~€60/an)

### Documente legale

- [ ] **DPIA (Data Protection Impact Assessment)** — obligatoriu pentru date publice. Costă €2-3K cu consultant DPO extern. SAU îl faci tu cu template ENISA (gratis dar 40 ore muncă).
- [ ] **DPA (Data Processing Agreement)** template în RO+EN — semnat cu fiecare primărie. ~€500-1000 pentru avocat să-l facă bine.
- [ ] **Termeni și condiții** + **Politica de confidențialitate** — focus pe special category data
- [ ] **Contract pilot gratuit** — clauze ieșire amiabilă + caz de succes obligatoriu

### Compliance NIS2 (ai termen până la luna 18)

- [ ] **Risk assessment** intern (ENISA template)
- [ ] **Incident response plan** (template gratuit ENISA)
- [ ] **Backup encryption + test recovery**
- [ ] **Vulnerability scanning** (OWASP ZAP gratis + Snyk free tier)
- [ ] **MFA pe toate conturile interne** (deja standard)
- [ ] **Audit trail immutable** (deja în arhitectură)

### Asigurări

- [ ] **Asigurare cyber** (Hiscox, AIG): €1.500-3.000/an pentru primă acoperire
- [ ] **Răspundere civilă profesională (PI)**: €500-1.000/an

### Buget total reglementare anul 1

| Categorie | Cost |
|---|---|
| ONRC + cont legal | €700 |
| Sigiliu electronic AdminAI | €250 |
| DPIA (cu consultant) | €2.500 |
| DPA legal RO+EN | €800 |
| Asigurări | €2.000 |
| Audit security basic | €1.500 |
| Buffer surprize | €1.500 |
| **TOTAL** | **~€9.250** |

---

## 📋 Timeline detaliat MVP (12 săptămâni)

### Săptămâna -2 la 0: Pre-launch
- [ ] SRL înființat
- [ ] Conturi cloud (Hetzner DC EU, Postgres, Redis, etc.)
- [ ] Domeniu adminai.ro (sau similar) + SSL
- [ ] Sigiliu electronic AdminAI cumpărat (al tău, NU al primăriei)
- [ ] Repository monorepo: `connector/`, `cloud/`, `dashboard/`, `whatsapp-bot/`
- [ ] CI/CD basic GitHub Actions
- [ ] DPIA primă draftare

### Săptămâna 1-2: Cloud foundation
- [ ] Schema Postgres: `Tenant`, `Citizen` (cache), `DocumentRequest`, `DocumentGenerated`, `AuditLog`
- [ ] Multi-tenant arch: workspaceId pe toate (refolosim pattern-ul din CRM)
- [ ] Auth: token JWT pentru connector, mTLS pe endpoints
- [ ] Rate limiting + audit log immutable
- [ ] Setup ANAF SPV OAuth (pentru Tier 3 viitor — dar pregătim infrastructura)

### Săptămâna 3-4: Connector v0
- [ ] Adapter SICO v8 cu read-only SQL (cea mai populară versiune)
- [ ] Local document generator (PDF + sign cu sigiliu primărie)
- [ ] Sync engine: pull schedule + push secure
- [ ] SQLite local pentru audit log
- [ ] Docker Compose pentru deploy primărie

### Săptămâna 5-6: WhatsApp bot
- [ ] WhatsApp Business Cloud API (Meta) integration — refolosim ce ai în CRM
- [ ] AI orchestrator: Claude Sonnet + tools pentru:
  - `verify_citizen(cnp, nume)` 
  - `request_otp(cnp)` 
  - `verify_otp(session, code)` 
  - `request_document(type, params)`
  - `get_document_status(id)`
- [ ] Conversation state management în Redis (TTL 30 min)
- [ ] Mesaje în română fluentă, ton oficial-prietenos

### Săptămâna 7-8: Dashboard primărie
- [ ] Login funcționar primărie (Stack Auth)
- [ ] Listă cereri în lucru/finalizate cu filtre
- [ ] Detalii pe fiecare cerere (audit complet)
- [ ] Generare manuală document (când AI eșuează)
- [ ] Statistici: cereri/zi, timp mediu, top tipuri
- [ ] Export rapoarte CSV pentru contabilitate primărie

### Săptămâna 9-10: Pilot setup
- [ ] Selecție primărie pilot (vezi sales playbook mai jos)
- [ ] Vizită fizică: instalare connector cu IT-ul lor
- [ ] Funcționar primărie face training 2 ore
- [ ] Test cu 5 cetățeni "voluntari" (rude, prieteni primar)
- [ ] Bug fix orice apare

### Săptămâna 11-12: Soft launch
- [ ] Lansare publică (poster în primărie + post Facebook primar)
- [ ] Daily check-in cu funcționari
- [ ] Targetăm 50-100 cetățeni unici în prima săptămână
- [ ] Colectare feedback + îmbunătățire prompt AI

### Cost MVP cumulativ

| Categorie | Cost |
|---|---|
| Pre-launch (legal + tools) | €1.500 |
| Hosting + infra (3 luni) | €600 |
| LLM API (Claude) | €300 |
| WhatsApp Cloud API | €200 |
| Sigiliu electronic AdminAI | €250 |
| Vizite la primărie pilot (Cluj/Iași) | €400 |
| Hardware connector (mini-PC dacă primărie nu are server) | €500 |
| Buffer | €1.000 |
| **TOTAL MVP CASH** | **~€4.750** |

**Asumpție:** primăria pilot nu plătește. Tu DAI sigiliul electronic temporar (sau folosești unul deja existent al primăriei, ideal).

---

## 🎯 Pilot acquisition: cum obții primul DA de la o primărie

Aceasta e partea cea mai dificilă. Fără pilot reușit, nu există business. Hai să fim foarte specifici.

### Profilul "primăriei perfecte" pentru pilot

**Bifezi cât mai multe:**
- ✅ Primar tânăr (35-45 ani) cu prezență digitală (LinkedIn activ, Facebook page)
- ✅ A câștigat fonduri PNRR pentru digitalizare (lista publică pe mfe.gov.ro)
- ✅ Comună 5-15K locuitori (suficient volum + decizie rapidă, nu prea mare)
- ✅ Folosește SICO (probabilitate 70%)
- ✅ A vorbit public despre "smart village" sau "digitalizare"
- ✅ E în județul tău sau al unui prieten (vizite ușoare)
- ✅ Nu e politizată extrem (evit primării cu primari în ediție 4 mandate)

### Sources pentru identificare candidați

1. **PNRR proiecte aprobate**: https://proiecte.pnrr.gov.ro — filtrează după Componenta C7 + tip beneficiar = UAT
2. **MFE proiecte digitalizare**: lista publică
3. **Asociația Comunelor din România** + **AMR (Asociația Municipiilor)** — vezi conferințe digitalizare
4. **LinkedIn**: search "primar" + filter România + activitate publică
5. **Presa locală**: "smart village România", "digitalizare primărie"

### Construiește lista ta primă (săptămâna 1)

**Target: 50 candidați primării**

Format Excel:
```
| Primărie | Locuitori | Primar | LinkedIn | PNRR? | Sistem IT | Județ | Score |
|---|---|---|---|---|---|---|---|
| Primăria Florești | 25.000 | Bogdan Pivariu | ✅ | ✅ | SICO | Cluj | 9/10 |
| ... | ... | ... | ... | ... | ... | ... | ... |
```

Prioritizezi top 10 după score.

### Outreach playbook

**Step 1: Pre-call research (1 oră per primărie)**
- Citește ultimele 5 postări LinkedIn primar
- Vezi proiectele PNRR aprobate
- Sună secretariatul primăriei: "Cu cine vorbesc despre proiectele de digitalizare?"

**Step 2: Email rece la primar (zilele 1-2)**
```
Subiect: Pilot gratuit — cetățenii din [Comună] să primească 
         certificat fiscal pe WhatsApp în 30 secunde

Bună ziua, dl. Primar [Nume],

Construiesc o platformă AI care permite cetățenilor să ceară 
certificat fiscal, adeverință domiciliu și situație impozite 
direct pe WhatsApp, fără să mai vină la primărie.

Documentul e generat în 30 secunde, semnat electronic 
cu sigiliul primăriei, valabil legal.

Caut 3 primării pilot pentru implementare GRATUITĂ 
pe 6 luni, în schimbul:
- 1 testimonial video (când veți fi mulțumit)
- 5 referrals către primării vecine
- Studiu de caz documentat

Pot face un demo live de 20 minute săptămâna viitoare?
[link Calendly]

Cu respect,
[Nume]
[Mobil] | [Email]
[Link site]
```

**Step 3: Follow-up dacă nu răspunde (zilele 5, 10, 15)**
- LinkedIn DM
- Telefon la secretariat: "I-am trimis dl. primar un email despre digitalizare. Pot vorbi cu dl. viceprimar sau secretar?"
- Decision maker poate fi viceprimar sau secretar general — secretarul are putere reală în multe primării

**Step 4: Demo (când primești da)**
- Vino fizic la primărie cu laptop (NU doar Zoom)
- Adu un mini-PC cu connectorul deja configurat (test în advance)
- Demonstrație live: TU trimiți un mesaj WhatsApp, AI răspunde, generează un certificat fiscal fictiv pentru un CNP test
- Întrebare cheie: "Câte certificate fiscale emiteți pe lună?"
- Calculator beneficii imediat (timp economisit funcționar × salariu)

**Step 5: Pilot agreement (când acceptă)**
- Contract scurt 2-3 pagini în RO
- Clauze:
  - 6 luni gratuit
  - 30 zile preaviz oricine la ieșire
  - Tu te ocupi de tot tehnic
  - Ei oferă cont read-only SICO + sigiliu electronic temporar
  - 1 testimonial dacă sunt mulțumiți la 6 luni
  - 5 referrals
  - Drept caz de succes (publicitate)

### Conversion rate realist

- 50 emailuri trimise → 10 răspunsuri (20%)
- 10 răspunsuri → 5 demo-uri (50%)
- 5 demo-uri → 1-2 piloturi acceptă (20-40%)

**Estimare:** 6-8 săptămâni de la primul email până la primul DA solid.

---

## 📈 Sales pipeline — Year 1 → Year 3

### Year 1 (lunile 1-12)

| Luna | Medical (lab/cabinete) | Primării | ARR cumulat |
|---|---|---|---|
| 1-3 | Build MVP | Validare PNRR | €0 |
| 4 | Primul plătitor medical | Pilot căutare | €5K |
| 5 | 3 plătitori medical | Pilot acceptat (gratuit) | €15K |
| 6 | 5 plătitori | Setup pilot | €25K |
| 7 | 8 plătitori | Pilot live | €35K |
| 8 | 12 plătitori | Caz de succes drafting | €50K |
| 9 | 15 plătitori | Caz de succes published | €70K |
| 10 | 20 plătitori | Primul plătitor primărie (€8K/an) | €95K |
| 11 | 25 plătitori | 2 plătitori primărie | €120K |
| 12 | 30 plătitori | 3 plătitori primărie | **€150K ARR** |

### Year 2 (lunile 13-24)

| Trimestru | Medical scale | Primării scale | ARR cumulat |
|---|---|---|---|
| Q1 (m13-15) | 40 plătitori | 5 primării | €280K |
| Q2 (m16-18) | 55 plătitori | 10 primării | €450K |
| Q3 (m19-21) | 70 plătitori + primul lab mare | 15 primării + primul oraș mediu | €650K |
| Q4 (m22-24) | 85 plătitori | 20 primării + 2 orașe | **€850K ARR** |

### Year 3 (lunile 25-36)

| Trimestru | Mix | ARR cumulat |
|---|---|---|
| Q1 | Win first PNRR public tender | €1.1M |
| Q2 | 3 municipii contract | €1.4M |
| Q3 | Expansion tier (HR, notariate) | €1.7M |
| Q4 | 50+ primării + medical mature | **€2-2.5M ARR** |

---

## 💰 Investment plan (24 luni)

| Categorie | An 1 | An 2 | Total 24m |
|---|---|---|---|
| Tu (founder, full-time) | €0 (bootstrapping) | €30K (salariu minim viabil) | €30K |
| Hosting + infra | €5K | €12K | €17K |
| API costs (LLM, WhatsApp, etc.) | €4K | €15K | €19K |
| Compliance + legal | €10K | €8K | €18K |
| Sales/marketing | €8K | €25K | €33K |
| Senior backend dev part-time (luna 9+) | €15K | €40K | €55K |
| Customer success rep (luna 12+) | €5K | €25K | €30K |
| Buffer | €5K | €10K | €15K |
| **TOTAL CASH OUT** | **€52K** | **€165K** | **€217K** |

**Cash flow pozitiv estimat:** luna 14-16 (când MRR > burn).

**Bootstrap path (fără fundraising):**
- Lunile 1-9: cash flow medical acoperă tot
- Lunile 10-18: reinvestire 100% profit medical în primării sales
- Lunile 18+: profit operațional pozitiv

**Sau cu un mic raise (€100-200K seed angel):**
- Accelerare 4-6 luni
- Sales rep dedicat primării de la luna 6
- ARR luna 24 = €1.2-1.5M (vs €850K bootstrap)

---

## ⚠️ Riscuri TOP 10 + mitigări

### 1. Indeco Soft te blochează (probabilitate medie, impact MARE)
- Ei pot refuza să-ți dea acces la SICO sau pot litiga pentru "reverse engineering"
- **Mitigare:** Ne integrăm DOAR pe baza de date a primăriei (cont read-only), NU pe API-ul Indeco
- **Mitigare 2:** parteneriat formal cu Indeco la luna 12-18 (revenue share posibil)

### 2. Schimbare politică / electorală (probabilitate înaltă, impact mediu)
- Primar nou poate rupe contract
- **Mitigare:** contract pe 3 ani cu clauze stricte, factură achitată în avans la 12 luni
- **Mitigare 2:** finanțare PNRR e mai stabilă politic decât bugetul local

### 3. ANSPDCP investigation (probabilitate mică, impact MAXIM)
- O sesizare de la cetățean → audit + amenzi 2-4% din cifra de afaceri
- **Mitigare:** DPIA solid, DPO extern pe loc, conformitate documentată
- **Mitigare 2:** asigurare cyber acoperă consultanță legală

### 4. PNRR pause/blocked (probabilitate medie, impact mare)
- UE poate suspenda fonduri (s-a întâmplat pentru alte componente)
- **Mitigare:** diversificare buget client (medical + privat + bugetul local primărie)

### 5. Competiție mare entră (Wizrom, Indeco lansează AI)
- **Mitigare:** speed to market + UX superior + WhatsApp-first (ei sunt slow incumbents)
- **Mitigare 2:** moat reglementar (DPA-uri, certificări ISO)

### 6. ROeID nu funcționează / e instabil (probabilitate înaltă în 2026)
- Articol din martie 2026 confirmă probleme tehnice ROeID
- **Mitigare:** Tier 2 (CNP + OTP) e default, ROeID = upgrade voluntar la luna 9-12

### 7. SICO upgrade rupe connectorul tău
- Indeco face update, schema se schimbă, totul cade
- **Mitigare:** versionezi adapterele (SICOv8Adapter, SICOv9Adapter), test suite automat
- **Mitigare 2:** monitor proactiv schimbări versiuni Indeco

### 8. Cetățean dă în judecată pentru document greșit
- AI generează adeverință cu date greșite
- **Mitigare:** validare dublă (connectorul + cloud) înainte de delivery
- **Mitigare 2:** asigurare PI + disclaimer "sub revizuirea funcționarului"

### 9. Burnout solo founder
- 12 luni intense, multă reglementare, sales lent
- **Mitigare:** co-founder potențial sau senior contractor de la luna 6
- **Mitigare 2:** stagger timeline — nu te epuiza în primele 4 luni

### 10. Funcționarii primăriei sabotează adopția
- "AI-ul ne ia jobul" — refuză să-l promoveze cetățenilor
- **Mitigare:** poziționare ca "asistent funcționar", NU înlocuitor
- **Mitigare 2:** training real + bonus financiar pentru primărie când AI rezolvă cazuri (10% economisit revine la primărie ca rebate)

---

## 🚦 Decision rules — când pivot/abandon

| Milestone | Trigger pivot | Trigger abandon |
|---|---|---|
| Luna 3 | < 100 documente generate cu medical (slow market) | < 10 (validare eșuată) |
| Luna 6 | Niciun lead primărie viabil → focus exclusiv medical | < €5K MRR medical → schimbă model |
| Luna 9 | Pilot primărie blocat tehnic SICO → fallback Wizrom-only | Niciun pilot semnat |
| Luna 12 | < €100K ARR → schimbă pricing sau positioning | < €30K ARR → kill the project |
| Luna 18 | < €400K ARR → reduce scope la 1 verticală | < €200K → exit |

---

## 📌 Primii 7 zile concrete

### Ziua 1 (luni)
1. Înființare SRL pe ONRC online (fac formele oficiale)
2. Cont Hetzner Frankfurt (server VPS pentru cloud)
3. Domeniu adminai.ro / similar (€15)

### Ziua 2 (marți)
1. Lista 30 primării candidați PNRR (Excel)
2. Score top 10 după criteriile de mai sus
3. Research LinkedIn primari top 10

### Ziua 3 (miercuri)
1. Primii 5 emailuri reci la primari (template-ul de mai sus)
2. 3 mesaje LinkedIn la primari activi
3. Sună secretariatul la 2 primării din top → cere "responsabil digitalizare"

### Ziua 4 (joi)
1. Cumpără sigiliu electronic Namirial sau certSign (~€250/an)
2. Cumpără certificat semnătură electronică personal (~€60/an)
3. Setup repo monorepo pe GitHub: `connector/`, `cloud/`, `whatsapp-bot/`, `dashboard/`

### Ziua 5 (vineri)
1. Schemă Postgres: `Tenant`, `Citizen`, `DocumentRequest`, `AuditLog`
2. Setup Hetzner cu Docker + Postgres + Redis + Nginx
3. Domain DNS + SSL (Let's Encrypt)

### Sâmbătă-Duminică (ziua 6-7)
1. Începe SICOv8Adapter (focus: getCitizen + getFiscalStatus)
2. Test pe SQL Server local cu schema simulată
3. Reflectează: scrie 1 page (Notion) ce ai învățat săptămâna asta

### Săptămâna 2 obiectiv
- 2 demo-uri programate cu primării
- SICO adapter funcțional (read-only test cu DB simulată)
- WhatsApp Business Cloud API setup test

---

## 🎓 Sources & resources

- ANAF SPV API: https://static.anaf.ro/static/10/Anaf/Informatii_R/API/Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf
- ROeID portal oficial: https://www.roeid.ro/
- ROeID middleware MAI: https://hub.mai.gov.ro/aplicatie-cei
- PNRR proiecte: https://proiecte.pnrr.gov.ro
- PNRR Componenta C7: https://economie.gov.ro/structura-organizatorica/directia-generala-gestiune-si-coordonare-pnrr/componenta-7-transformare-digitala/
- Indeco Soft: https://indecosoft.ro/site/home/
- Sigiliu electronic certSign: https://www.certsign.ro/ro/produse/servicii-de-incredere-eidas/sigiliu-electronic/
- Sigiliu electronic Namirial: https://www.namirial.ro/detalii/sigiliu-electronic-calificat/
- Cartea de identitate (oficial): https://carteadeidentitate.gov.ro/
- ANSPDCP (autoritate date personale): https://www.dataprotection.ro
- SEAP (achiziții publice): https://www.e-licitatie.ro

---

## 🏁 Concluzie strategică

**Asta nu e doar un plan, e un moat.** Combinația de:
1. Connector tehnic care respectă suveranitatea datelor primăriei
2. Multi-vertical platform (medical + primării din aceeași infrastructură)
3. Compliance + reglementare ca barieră de intrare pentru competitori
4. PNRR funding ca tail wind pentru sales 2026

...îți dă o oportunitate REALĂ de a construi ceva ce vor cumpăra mai departe.

**Cele 3 principii ne-negociabile:**

1. **Datele cetățeanului NU părăsesc primăria în clar** — niciodată
2. **Sigiliul electronic NU iese din primărie** — generarea documentelor e LOCAL
3. **Audit log immutable pentru fiecare interacțiune** — niciun mister, niciodată

Dacă respecți aceste 3, ai un produs vandabil oricând la oricine.

**Singurul KPI care contează în primele 90 zile:**
🎯 **Un cetățean primește un certificat fiscal valid pe WhatsApp de la o primărie reală.**

Restul e execuție.
