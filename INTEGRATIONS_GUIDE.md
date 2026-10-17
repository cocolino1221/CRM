# Lead Import & Integration Guide

This guide explains how to automatically import leads into your CRM from Google Sheets, Typeform, and Kajabi.

## Overview

Your CRM has 14 integrations available, with automatic lead import capabilities for:
- **Google Sheets** - Import contacts from spreadsheets
- **Typeform** - Automatically create leads when forms are submitted
- **Kajabi** - Automatically create leads when members join or purchase

## Current Integrations Status

✅ **Working Integrations** (14 total):
1. Google (Calendar + Sheets + Contacts)
2. Typeform (Forms + Webhooks)
3. Kajabi (Members + Webhooks)
4. Slack
5. Zoom
6. PandaDoc
7. DocuSign
8. Calendly
9. WhatsApp
10. Microsoft
11. Salesforce
12. HubSpot
13. Pipedrive
14. Custom integrations

---

## 1. Google Sheets Import

### Setup

1. **Connect Google Integration**
   - Navigate to http://localhost:3001/integrations
   - Click "Connect" on Google integration
   - Authorize access to your Google account
   - Grant permissions for Google Drive and Sheets

2. **List Your Sheets**
   ```bash
   GET /api/v1/integrations/:integrationId/google/sheets
   ```

   This will return all your Google Sheets with their IDs.

3. **Preview Sheet Data**
   ```bash
   GET /api/v1/integrations/:integrationId/google/sheets/:sheetId?range=A1:Z100
   ```

4. **Import Contacts from Sheet**
   ```bash
   POST /api/v1/integrations/:integrationId/google/sheets/:sheetId/import

   Body:
   {
     "range": "Sheet1!A1:F1000",  // Optional, defaults to A1:Z1000
     "mapping": {
       "A": "firstName",
       "B": "lastName",
       "C": "email",
       "D": "phone",
       "E": "jobTitle"
     },
     "skipFirstRow": true,  // Skip header row
     "pipelineId": "uuid",  // Optional - which pipeline to add to
     "pipelineStageId": "uuid"  // Optional - which stage
   }
   ```

### Example Sheet Structure

| First Name | Last Name | Email | Phone | Job Title |
|------------|-----------|-------|-------|-----------|
| John | Doe | john@example.com | +1234567890 | CEO |
| Jane | Smith | jane@example.com | +0987654321 | Manager |

### Column Mapping

You can map any column letter to these contact fields:
- `firstName`, `lastName`, `email` (required)
- `phone`, `jobTitle`, `companyName`
- Any other data goes into `customFields`

### What Happens

- Each row becomes a contact in your CRM
- Contacts are automatically marked as "Lead" status
- Source is set to "google_sheets"
- Duplicates (same email) are skipped
- You'll get a summary: `{ totalImported, totalSkipped, errors }`

---

## 2. Typeform Integration

### Setup

1. **Get Typeform API Key**
   - Go to https://admin.typeform.com/account#/section/tokens
   - Create a new Personal Access Token
   - Copy the token

2. **Install Typeform Integration**
   ```bash
   POST /api/v1/integrations/install

   Body:
   {
     "type": "typeform",
     "authType": "apiKey",
     "credentials": {
       "apiKey": "your-typeform-token"
     }
   }
   ```

3. **Set Up Webhook** (Automatic Lead Creation)
   - In Typeform, go to your form → Connect → Webhooks
   - Add webhook URL: `https://your-backend-url/api/v1/integrations/webhooks/:integrationId`
   - When someone submits your form, a lead is **automatically created**

### How It Works

When a form is submitted:
1. Typeform sends webhook to your CRM
2. Handler extracts email, name, phone from form answers
3. Contact is automatically created with:
   - Status: `LEAD`
   - Source: `TYPEFORM`
   - Tags: `['typeform', 'Form Name']`
   - Custom fields include all form responses
   - Lead score from calculated field (if any)
   - Automatically added to default pipeline

### Field Mapping

Typeform automatically detects:
- Email fields → `contact.email`
- Fields with "name" or "first" → `contact.firstName`
- Fields with "last" → `contact.lastName`
- Phone number fields → `contact.phone`
- Everything else → `customFields`

### Manual Sync (Get Past Responses)

```bash
POST /api/v1/integrations/:id/sync

Body:
{
  "type": "responses",
  "formId": "your-form-id"
}
```

---

## 3. Kajabi Integration

### Setup

1. **Get Kajabi API Key**
   - Log into Kajabi
   - Go to Settings → Integrations → API
   - Generate API key

2. **Install Kajabi Integration**
   ```bash
   POST /api/v1/integrations/install

   Body:
   {
     "type": "kajabi",
     "authType": "apiKey",
     "credentials": {
       "apiKey": "your-kajabi-api-key"
     }
   }
   ```

3. **Set Up Webhooks** (Automatic Lead Creation)
   - In Kajabi, go to Settings → Webhooks
   - Add webhook URL: `https://your-backend-url/api/v1/integrations/webhooks/:integrationId`
   - Subscribe to events:
     - `member.created` - New member joins
     - `member.updated` - Member profile updated
     - `offer.purchased` - Member purchases an offer
     - `assessment.completed` - Member completes assessment

### How It Works

**When a member joins** (`member.created`):
1. Contact created with status `LEAD` and source `KAJABI`
2. Added to default pipeline
3. Tags from Kajabi are preserved
4. Kajabi member ID stored in `customFields`

**When a member purchases** (`offer.purchased`):
1. Contact status changed to `CUSTOMER`
2. Purchase info stored in `customFields`:
   - `lastPurchaseDate`
   - `lastPurchasedOffer`
   - `lastPurchaseAmount`

**When assessment completed** (`assessment.completed`):
1. Contact's `leadScore` updated with assessment score
2. Assessment data stored in `customFields`

### Manual Sync (Import All Members)

```bash
POST /api/v1/integrations/:id/sync

# This will import ALL Kajabi members as leads
```

---

## Integration Configuration

### Pipeline Configuration

You can configure which pipeline new leads should be added to:

```bash
PATCH /api/v1/integrations/:id

Body:
{
  "config": {
    "typeformPipeline": {
      "pipelineId": "uuid-of-pipeline",
      "pipelineStageId": "uuid-of-stage"
    },
    "kajabiPipeline": {
      "pipelineId": "uuid-of-pipeline",
      "pipelineStageId": "uuid-of-stage"
    }
  }
}
```

If not configured, leads are added to your default pipeline's first stage.

---

## API Endpoints Reference

### Google Sheets
- `GET /api/v1/integrations/:id/google/sheets` - List all sheets
- `GET /api/v1/integrations/:id/google/sheets/:sheetId` - Get sheet data & metadata
- `POST /api/v1/integrations/:id/google/sheets/:sheetId/import` - Import contacts

### Typeform
- `POST /api/v1/integrations/:id/sync` - Sync form responses
- `POST /api/v1/integrations/webhooks/:id` - Webhook endpoint (for Typeform)

### Kajabi
- `POST /api/v1/integrations/:id/sync` - Sync all members
- `POST /api/v1/integrations/webhooks/:id` - Webhook endpoint (for Kajabi)

### General
- `GET /api/v1/integrations` - List all your integrations
- `GET /api/v1/integrations/available` - List available integration types
- `POST /api/v1/integrations/install` - Install new integration
- `POST /api/v1/integrations/:id/test` - Test connection
- `DELETE /api/v1/integrations/:id` - Remove integration

---

## Webhook URLs

For webhook-based integrations, use these URLs:

**Production:**
```
https://your-domain.com/api/v1/integrations/webhooks/:integrationId
```

**Development (local):**
```
http://localhost:3000/api/v1/integrations/webhooks/:integrationId
```

**Note:** For local development, you'll need to use a tool like `ngrok` to expose your local server:
```bash
ngrok http 3000
# Use the ngrok URL for webhooks during development
```

---

## Contact Sources

When leads are imported, they're tagged with a source:

- `google_sheets` - Imported from Google Sheets
- `typeform` - From Typeform submission
- `kajabi` - From Kajabi membership
- `manual` - Manually created
- `slack` - From Slack integration
- `whatsapp` - From WhatsApp
- etc.

You can filter contacts by source in the CRM.

---

## Error Handling

### Duplicate Contacts

If a contact with the same email already exists:
- Import skips the duplicate
- Webhook returns `status: 'duplicate'`
- Existing contact is NOT updated (to prevent data loss)

### Missing Email

- Contacts without email are skipped
- Error is logged: `"No email found in form response/member data"`

### Rate Limiting

- Google Sheets: 100 requests per 100 seconds
- Typeform: 120 requests per minute
- Kajabi: 100 requests per minute

---

## Best Practices

1. **Test First**: Always test with a small batch before importing thousands of contacts
2. **Clean Data**: Ensure your spreadsheets have valid email addresses
3. **Use Headers**: Skip the first row if it contains column headers
4. **Map Correctly**: Double-check your column mapping before importing
5. **Monitor Webhooks**: Check integration logs for webhook delivery status
6. **Set Pipelines**: Configure default pipelines for each integration

---

## Example: Complete Google Sheets Import Flow

```javascript
// 1. Get your Google integration ID
const integrations = await fetch('/api/v1/integrations').then(r => r.json())
const googleIntegration = integrations.integrations.find(i => i.type === 'google')

// 2. List your sheets
const sheets = await fetch(`/api/v1/integrations/${googleIntegration.id}/google/sheets`)
  .then(r => r.json())

console.log('Your sheets:', sheets.sheets)

// 3. Preview a sheet
const sheetId = 'your-sheet-id'
const preview = await fetch(
  `/api/v1/integrations/${googleIntegration.id}/google/sheets/${sheetId}?range=A1:F10`
).then(r => r.json())

console.log('Sheet preview:', preview)

// 4. Import contacts
const result = await fetch(
  `/api/v1/integrations/${googleIntegration.id}/google/sheets/${sheetId}/import`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapping: {
        'A': 'firstName',
        'B': 'lastName',
        'C': 'email',
        'D': 'phone'
      },
      skipFirstRow: true,
      pipelineId: 'your-pipeline-id'
    })
  }
).then(r => r.json())

console.log(`Imported: ${result.totalImported}, Skipped: ${result.totalSkipped}`)
```

---

## Troubleshooting

### Google Sheets Not Showing
- Ensure Google Drive scope is authorized
- Check that sheets aren't trashed
- Verify the sheet is accessible by your Google account

### Typeform Webhook Not Working
- Verify webhook URL is correct
- Check that integration is enabled
- Look at integration logs: `GET /api/v1/integrations/:id/logs`
- Ensure Typeform webhook is active

### Kajabi Not Creating Leads
- Verify API key is valid
- Check webhook subscription is active
- Ensure member has an email address
- Look at integration logs

### Contact Not Imported
- Check if email already exists in CRM
- Verify email format is valid
- Check integration error logs
- Ensure required fields are present

---

## Next Steps

1. **Set up integrations**: Connect Google, Typeform, and Kajabi
2. **Import existing leads**: Use Google Sheets import for bulk import
3. **Set up webhooks**: Configure Typeform and Kajabi webhooks for automatic lead creation
4. **Configure pipelines**: Set default pipelines for each integration
5. **Test the flow**: Submit test forms/create test members to verify automation

Your CRM is now ready to automatically capture leads from multiple sources!
