# Typeform Integration Guide

## Overview

Integrarea Typeform permite crearea automată de contacte și leads în CRM atunci când cineva completează un formular Typeform.

## Cum funcționează

1. **Utilizator completează formular Typeform** → Trimite răspunsul
2. **Typeform webhook** → Trimite datele către CRM
3. **CRM procesează datele** → Creează automat:
   - Contact nou cu informațiile din formular
   - Lead în pipeline-ul specificat
   - Tags și metadata pentru tracking

## Configurare Pas cu Pas

### 1. Obține API Key de la Typeform

1. Accesează: https://admin.typeform.com/account#/section/tokens
2. Click "Generate a new token"
3. Denumire: "SlackCRM Integration"
4. Scopes necesare:
   - ✅ accounts:read
   - ✅ forms:read
   - ✅ responses:read
   - ✅ webhooks:write
5. Click "Generate token"
6. **Copiază token-ul** (nu îl vei mai vedea!)

### 2. Configurează Backend (.env)

Adaugă în `backend/.env`:

```bash
# Typeform Integration
TYPEFORM_API_KEY=tfp_YOUR_API_KEY_HERE_1234567890
```

### 3. Conectează Typeform în CRM

#### A. Din Interface

1. Loghează-te în CRM: http://localhost:3001/integrations
2. Găsește "Typeform" în lista de integrări
3. Click "Connect"
4. Introdu API Key-ul
5. Click "Save"

#### B. Via API (opțional)

```bash
curl -X POST http://localhost:3000/api/v1/integrations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "TYPEFORM",
    "name": "Typeform Lead Forms",
    "credentials": {
      "apiKey": "tfp_YOUR_API_KEY_HERE"
    },
    "config": {
      "typeformPipeline": {
        "pipelineId": "PIPELINE_UUID",
        "pipelineStageId": "STAGE_UUID"
      }
    }
  }'
```

### 4. Configurează Webhook în Typeform

Pentru fiecare formular care trebuie să creeze leads:

1. Du-te la Typeform: https://admin.typeform.com
2. Deschide formularul dorit
3. Click pe **Connect** → **Webhooks**
4. Add endpoint:
   ```
   http://localhost:3000/api/v1/integrations/webhook/typeform
   ```

   **Pentru producție:**
   ```
   https://slackcrm-backend.fly.dev/api/v1/integrations/webhook/typeform
   ```

5. Click "Save webhook"
6. Click "Test request" pentru a verifica

### 5. Configurează Pipeline (Opțional)

Poți specifica în ce pipeline și în ce stadiu să fie adăugați leads-urile:

```json
{
  "config": {
    "typeformPipeline": {
      "pipelineId": "uuid-pipeline",
      "pipelineStageId": "uuid-stage"
    }
  }
}
```

**Dacă nu specifici un pipeline:**
- Se va folosi pipeline-ul **default** din workspace
- Lead-ul va fi adăugat în **primul stadiu** al pipeline-ului

## Mapare Câmpuri

Integrarea mapează automat câmpurile din Typeform la câmpurile CRM:

| Typeform Field | CRM Field | Notă |
|----------------|-----------|------|
| Email field | `email` | **Obligatoriu** - fără email, contactul nu se creează |
| First name / Name | `firstName` | Default: "Lead" |
| Last name | `lastName` | Default: "from Typeform" |
| Phone / Phone number | `phone` | Optional |
| Company | `companyName` | Se salvează în customFields |
| Alte câmpuri | `customFields` | Toate celelalte răspunsuri |
| Form score | `leadScore` | Dacă formularul are calculator de scor |

## Exemplu de Formular Typeform

### Câmpuri Recomandate

1. **Email** (required)
   - Type: Email
   - Reference: `email`

2. **First Name** (required)
   - Type: Short text
   - Reference: `first_name`

3. **Last Name** (required)
   - Type: Short text
   - Reference: `last_name`

4. **Phone** (optional)
   - Type: Phone number
   - Reference: `phone`

5. **Company** (optional)
   - Type: Short text
   - Reference: `company`

6. **Other questions** (optional)
   - Orice alte întrebări vor fi salvate în `customFields`

## Date Salvate Automat

### Contact
```json
{
  "firstName": "Ion",
  "lastName": "Popescu",
  "email": "ion@example.com",
  "phone": "+40712345678",
  "status": "ACTIVE",
  "source": "FORM",
  "tags": ["typeform", "Nume Formular"],
  "leadScore": 75,
  "customFields": {
    "company": "ABC Corp",
    "budget": "€10,000",
    "typeformMetadata": {
      "formId": "abc123",
      "formTitle": "Lead Generation Form",
      "submittedAt": "2025-01-21T10:30:00Z",
      "responseToken": "xyz789",
      "typeformUrl": "https://admin.typeform.com/form/abc123/results#responses"
    }
  },
  "notes": "Lead created from Typeform: Lead Generation Form"
}
```

### Pipeline Assignment
- Adăugat automat la pipeline-ul specificat sau default
- Status: "New Lead"
- Poate fi mutat ulterior între stadii

## Testare

### 1. Test Manual

```bash
# Trimite un webhook de test
curl -X POST http://localhost:3000/api/v1/integrations/webhook/typeform \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "test123",
    "event_type": "form_response",
    "form_response": {
      "form_id": "test-form",
      "token": "test-token",
      "submitted_at": "2025-01-21T10:30:00Z",
      "definition": {
        "id": "test-form",
        "title": "Test Lead Form",
        "fields": []
      },
      "answers": [
        {
          "type": "email",
          "email": "test@example.com",
          "field": {
            "id": "email",
            "type": "email",
            "ref": "email"
          }
        },
        {
          "type": "text",
          "text": "John",
          "field": {
            "id": "fname",
            "type": "short_text",
            "ref": "first_name"
          }
        },
        {
          "type": "text",
          "text": "Doe",
          "field": {
            "id": "lname",
            "type": "short_text",
            "ref": "last_name"
          }
        }
      ]
    }
  }'
```

### 2. Verifică în CRM

1. Du-te la: http://localhost:3001/contacts
2. Caută email: `test@example.com`
3. Verifică că s-a creat contactul cu:
   - ✅ Nume: John Doe
   - ✅ Email: test@example.com
   - ✅ Source: FORM
   - ✅ Tags: typeform, Test Lead Form
   - ✅ În pipeline specificat

### 3. Verifică Logs

```bash
# Backend logs
cd backend && npm run start:dev

# Caută în output:
# ✅ "Processing Typeform webhook: form_response"
# ✅ "Contact created from Typeform: UUID (email)"
```

## Tratare Erori

### Error: "No email found in form response"
**Cauză:** Formularul nu are câmp de email sau nu a fost completat
**Soluție:** Asigură-te că formularul are un câmp "Email" obligatoriu

### Error: "Contact with this email already exists"
**Cauză:** Există deja un contact cu același email
**Soluție:** Webhook returnează status "duplicate" - nu e o eroare, e normal

### Error: "API key not configured"
**Cauză:** TYPEFORM_API_KEY lipsește din .env
**Soluție:** Adaugă API key în backend/.env

### Error: "Failed to create webhook"
**Cauză:** API key invalid sau lipsă permisiuni
**Soluție:**
1. Verifică că API key-ul e corect
2. Verifică că are scope `webhooks:write`
3. Regenerează token-ul dacă e necesar

## Configurare Avansată

### Custom Pipeline per Formular

Poți configura pipeline diferite pentru formulare diferite folosind metadata:

```javascript
// În integration config
{
  "typeformPipeline": {
    "pipelineId": "default-pipeline-id",
    "pipelineStageId": "new-lead-stage-id",
    "formMappings": {
      "form-id-1": {
        "pipelineId": "sales-pipeline-id",
        "pipelineStageId": "qualified-stage-id"
      },
      "form-id-2": {
        "pipelineId": "marketing-pipeline-id",
        "pipelineStageId": "nurture-stage-id"
      }
    }
  }
}
```

### Auto-assign Owner

Poți seta un owner automat pentru leads:

```javascript
{
  "typeformPipeline": {
    "defaultOwnerId": "user-uuid",
    "defaultSetterId": "setter-uuid"
  }
}
```

### Custom Field Mapping

Mapare personalizată între câmpuri Typeform și CRM:

```javascript
{
  "fieldMappings": {
    "company_name": "companyName",
    "job_title": "jobTitle",
    "budget_range": "customFields.budget"
  }
}
```

## Troubleshooting

### Webhook nu funcționează

1. **Verifică URL-ul:**
   ```bash
   # Test că backend-ul răspunde
   curl http://localhost:3000/api/v1/health
   ```

2. **Verifică logs în Typeform:**
   - Du-te la webhook settings în Typeform
   - Click pe "View request log"
   - Verifică status code și response

3. **Verifică firewall/network:**
   - Asigură-te că Typeform poate accesa backend-ul tău
   - Pentru localhost, folosește ngrok sau similar:
     ```bash
     ngrok http 3000
     # Folosește URL-ul ngrok ca webhook URL
     ```

### Contacte duplicate

Typeform trimite webhook-uri multiple uneori. CRM detectează automat duplicate pe bază de email și returnează "duplicate" status.

### Performance

Pentru volume mari de submissions:
- Rate limit: 200 requests/60s (configurat în .env)
- Webhook processing: async, nu blochează Typeform
- Consider folosind queue processor pentru volume foarte mari

## Best Practices

1. **Testează mereu webhook-ul** după configurare
2. **Folosește fields reference consistente** în Typeform (email, first_name, etc.)
3. **Monitorizează logs** pentru erori
4. **Configurează email notifications** pentru leads noi
5. **Review și curăță date** periodic

## Support

Pentru probleme sau întrebări:
1. Verifică logs: `cd backend && npm run start:dev`
2. Verifică configurația: `./scripts/verify-oauth.sh`
3. Check documentation: https://developer.typeform.com/webhooks/

## Următorii Pași

După configurare:
- [ ] Testează cu un formular real
- [ ] Configurează notificări pentru leads noi
- [ ] Setează automation rules pentru follow-up
- [ ] Configurează email drip campaigns
- [ ] Integrează cu alte tools (Slack notifications, etc.)
