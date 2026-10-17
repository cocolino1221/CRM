# Slack CRM Integration Setup Guide

Complete guide to integrate your CRM with Slack for adding leads directly from Slack.

## 🚀 Quick Overview

This integration allows you to:
- Add leads from Slack using slash commands
- Use interactive forms (modals) for easy data entry
- Search and manage leads without leaving Slack
- View CRM analytics in Slack
- Tag and categorize leads

## 📋 Prerequisites

- Slack workspace admin access
- Backend deployed at: `https://slackcrm-backend.fly.dev`
- Slack App creation permissions

---

## Step 1: Create Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Enter:
   - **App Name**: `CRM Bot` (or your choice)
   - **Workspace**: Select your workspace
5. Click **"Create App"**

---

## Step 2: Configure Slash Commands

Go to **Features → Slash Commands** in your app settings.

### Create these commands:

#### Command 1: /crm-new-lead
- **Command**: `/crm-new-lead`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Open form to add a new lead`
- **Usage Hint**: `[opens interactive form]`

#### Command 2: /crm-add
- **Command**: `/crm-add`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Quick add lead or open form`
- **Usage Hint**: `[email|firstName|lastName|phone] or leave empty for form`

#### Command 3: /crm-search
- **Command**: `/crm-search`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Search for contacts`
- **Usage Hint**: `[email or name]`

#### Command 4: /crm-stats
- **Command**: `/crm-stats`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `View CRM analytics`
- **Usage Hint**: `[no arguments needed]`

#### Command 5: /crm-tag
- **Command**: `/crm-tag`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Add tags to a contact`
- **Usage Hint**: `[email] [tag1,tag2,tag3]`

#### Command 6: /crm-follow-up
- **Command**: `/crm-follow-up`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Mark contact for follow-up`
- **Usage Hint**: `[email]`

#### Command 7: /crm-high-ticket
- **Command**: `/crm-high-ticket`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Mark as high-ticket lead`
- **Usage Hint**: `[email]`

#### Command 8: /crm-low-ticket
- **Command**: `/crm-low-ticket`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Mark as low-ticket lead`
- **Usage Hint**: `[email]`

#### Command 9: /crm-lost
- **Command**: `/crm-lost`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Mark lead as lost`
- **Usage Hint**: `[email]`

#### Command 10: /crm-help
- **Command**: `/crm-help`
- **Request URL**: `https://slackcrm-backend.fly.dev/slack/commands`
- **Short Description**: `Show all CRM commands`
- **Usage Hint**: `[no arguments needed]`

---

## Step 3: Enable Interactivity (IMPORTANT!)

This is needed for the interactive forms/modals.

1. Go to **Features → Interactivity & Shortcuts**
2. Turn **ON** the toggle for "Interactivity"
3. Set **Request URL**: `https://slackcrm-backend.fly.dev/slack/interactive`
4. Click **"Save Changes"**

---

## Step 4: Install App to Workspace

1. Go to **Settings → Install App**
2. Click **"Install to Workspace"**
3. Review permissions and click **"Allow"**

---

## 🎯 How Data Flows: Slack → CRM

### Flow Diagram:

```
┌─────────────┐
│   Slack     │
│   User      │
└──────┬──────┘
       │
       │ Types: /crm-add john@example.com|John|Doe|+1234567890
       │
       ▼
┌─────────────────────────────────────────────┐
│          Slack Platform                     │
│  (Detects slash command)                    │
└──────┬──────────────────────────────────────┘
       │
       │ HTTP POST Request
       │ {
       │   "command": "/crm-add",
       │   "text": "john@example.com|John|Doe|+1234567890",
       │   "user_id": "U123456",
       │   "team_id": "T123456"
       │ }
       │
       ▼
┌─────────────────────────────────────────────┐
│    Backend: SlackController                 │
│    POST /slack/commands                     │
└──────┬──────────────────────────────────────┘
       │
       │ Calls SlackService.handleCommand()
       │
       ▼
┌─────────────────────────────────────────────┐
│    SlackService                             │
│    - Parses command text                    │
│    - Validates data                         │
│    - Creates Contact in database            │
└──────┬──────────────────────────────────────┘
       │
       │ Saves to PostgreSQL
       │
       ▼
┌─────────────────────────────────────────────┐
│    Database (Neon PostgreSQL)               │
│    - Contacts table                         │
│    - workspaceId = team_id                  │
│    - source = 'slack'                       │
└──────┬──────────────────────────────────────┘
       │
       │ Success response
       │
       ▼
┌─────────────────────────────────────────────┐
│    SlackService                             │
│    Returns formatted Slack message          │
└──────┬──────────────────────────────────────┘
       │
       │ Response with Slack Blocks
       │ {
       │   "blocks": [
       │     { "type": "section", "text": "✅ Contact Added!" }
       │   ]
       │ }
       │
       ▼
┌─────────────────────────────────────────────┐
│    Slack Platform                           │
│    Displays message to user                 │
└─────────────────────────────────────────────┘
```

---

## 📝 Usage Examples

### Example 1: Quick Add with Command Line

```bash
/crm-add john.doe@company.com|John|Doe|+15551234567
```

**What happens:**
1. Slack sends this to your backend
2. Backend parses: email, firstName, lastName, phone
3. Creates contact in database
4. Returns success message with contact details

### Example 2: Interactive Form

```bash
/crm-new-lead
```

**What happens:**
1. Slack sends command to backend
2. Backend returns a button "Open Lead Form"
3. User clicks button
4. Slack sends button click to `/slack/interactive`
5. Backend responds with modal (form)
6. User fills form and submits
7. Slack sends form data to `/slack/interactive`
8. Backend creates contact and shows success

### Example 3: Search Contacts

```bash
/crm-search john
```

**What happens:**
1. Backend searches database for contacts matching "john"
2. Returns formatted list of contacts
3. Shows: Name, Email, Status, Tags, Lead Score

---

## 🔐 Important Configuration Notes

### Backend Endpoints:

Your backend has these endpoints ready:

1. **Commands**: `POST /slack/commands`
   - Handles all slash commands
   - Parses command text
   - Returns responses or opens modals

2. **Interactive**: `POST /slack/interactive`
   - Handles button clicks
   - Handles modal submissions
   - Processes form data

3. **Events**: `POST /slack/events`
   - Handles Slack events (if needed)
   - Includes URL verification

### Workspace ID Mapping:

- Slack's `team_id` is used as `workspaceId` in your database
- This ensures multi-tenant data separation
- Each Slack workspace sees only their own contacts

---

## ✅ Testing the Integration

### Test 1: Help Command
```bash
/crm-help
```
Should display all available commands.

### Test 2: Quick Add
```bash
/crm-add test@example.com|Test|User|+15551234567
```
Should create a contact and show success message.

### Test 3: Interactive Form
```bash
/crm-new-lead
```
Should show a button. Click it to open the form.

### Test 4: Search
```bash
/crm-search test@example.com
```
Should find the contact you just created.

### Test 5: Analytics
```bash
/crm-stats
```
Should show your CRM statistics.

---

## 🐛 Troubleshooting

### Command doesn't respond
- Check backend is running: `https://slackcrm-backend.fly.dev/api/v1/health`
- Verify Request URL in Slack app settings
- Check Slack app is installed in workspace

### "Modal didn't open"
- Verify Interactivity is enabled
- Check Interactive Request URL is correct
- Look at backend logs for errors

### "Contact not created"
- Check database connection
- Verify workspaceId/team_id mapping
- Check backend logs for validation errors

### "Unauthorized" or "Permission denied"
- Reinstall Slack app
- Check app permissions
- Verify OAuth scopes

---

## 📊 Data Schema

Contacts created from Slack are stored with:

```javascript
{
  id: "uuid",
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  phone: "+15551234567",
  workspaceId: "T123456", // Your Slack team_id
  source: "slack",         // Tagged as from Slack
  status: "lead",          // Initial status
  leadScore: 0,            // Auto-calculated
  tags: [],                // Can be added with /crm-tag
  notes: "",               // Optional
  createdAt: "2025-10-24T...",
  updatedAt: "2025-10-24T..."
}
```

---

## 🔄 Sync Workflow

When you add a lead from Slack:

1. ✅ Lead is immediately saved to database
2. ✅ Lead appears in web CRM at: https://easyteamcrm.netlify.app/leads
3. ✅ Lead is assigned to default pipeline stage
4. ✅ Lead score is auto-calculated
5. ✅ Source is marked as "Slack"
6. ✅ You can manage it from Slack or Web CRM

---

## 🎨 Customization

You can customize the integration in:

**Backend Code:**
- `/backend/src/integrations/slack/slack.service.ts` - Command handlers
- `/backend/src/integrations/slack/slack.controller.ts` - Endpoints

**Available Customizations:**
- Add more slash commands
- Modify modal form fields
- Change response messages
- Add custom validation rules
- Add more notification types

---

## 📱 Mobile Support

All Slack commands work on:
- ✅ Slack Desktop App
- ✅ Slack Mobile App (iOS/Android)
- ✅ Slack Web Browser

---

## 🚀 Production Deployment

Your backend is already deployed and ready:
- **URL**: https://slackcrm-backend.fly.dev
- **Status**: Check at https://slackcrm-backend.fly.dev/api/v1/health
- **Database**: Neon PostgreSQL (automatically connected)

---

## 📞 Support

If you need help:
1. Check backend logs: `flyctl logs -a slackcrm-backend`
2. Check Slack app event logs in Slack API dashboard
3. Test endpoints directly with curl/Postman

---

## ✨ Next Steps

1. ✅ Complete Steps 1-4 above
2. ✅ Test with `/crm-help` command
3. ✅ Add your first lead with `/crm-new-lead`
4. ✅ View it in web CRM
5. ✅ Try searching with `/crm-search`
6. ✅ Check analytics with `/crm-stats`

**You're all set! 🎉**
