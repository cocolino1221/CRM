# Google Calendar & Meet Integration Guide

## ✅ Completed

1. **Google APIs Package** - Installed `googleapis` and `@google-cloud/local-auth`
2. **GoogleCalendarService** - Full-featured service at `backend/src/integrations/services/google-calendar.service.ts`
   - OAuth2 authentication
   - Create/Read/Update/Delete calendar events
   - Add Google Meet links
   - Natural language event creation
   - List today's/week's events
   - Attendee management

## 🔧 Configuration Required

### 1. Google Cloud Console Setup

1. Go to https://console.cloud.google.com
2. Create a new project or select existing one
3. Enable APIs:
   - Google Calendar API
   - Google Meet API (included in Calendar)
   - People API (for contacts)
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/v1/integrations/google/callback` (development)
     - `https://slackcrm-backend.fly.dev/api/v1/integrations/google/callback` (production)
   - Copy Client ID and Client Secret

### 2. Environment Variables

Add to `backend/.env` and Fly.io secrets:

```bash
GOOGLE_CLIENT_ID=your-google-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_CALLBACK_URL=https://slackcrm-backend.fly.dev/api/v1/integrations/google/callback
```

Set on Fly.io:
```bash
flyctl secrets set \\
  GOOGLE_CLIENT_ID="your-client-id" \\
  GOOGLE_CLIENT_SECRET="your-client-secret" \\
  GOOGLE_CALLBACK_URL="https://slackcrm-backend.fly.dev/api/v1/integrations/google/callback" \\
  -a slackcrm-backend
```

## 📝 Implementation Steps

### Backend (Estimated: 2-3 hours)

#### 1. Update Google Handler

**File**: `backend/src/integrations/handlers/google.handler.ts`

```typescript
import { GoogleCalendarService } from '../services/google-calendar.service';

@Injectable()
export class GoogleIntegrationHandler implements IntegrationHandler {
  constructor(
    private httpService: HttpService,
    private googleCalendarService: GoogleCalendarService
  ) {}

  async createCalendarEvent(integration: Integration, eventData: any) {
    this.googleCalendarService.setCredentials(
      integration.credentials?.accessToken,
      integration.credentials?.refreshToken
    );

    return await this.googleCalendarService.createEvent(eventData, true); // true = add Meet link
  }

  async listCalendarEvents(integration: Integration, options?: any) {
    this.googleCalendarService.setCredentials(
      integration.credentials?.accessToken,
      integration.credentials?.refreshToken
    );

    return await this.googleCalendarService.listEvents(options);
  }
}
```

#### 2. Add Calendar Controller

**File**: `backend/src/integrations/controllers/calendar.controller.ts`

```typescript
import { Controller, Post, Get, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { IntegrationsService } from '../integrations.service';

@Controller('api/v1/calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(
    private googleCalendarService: GoogleCalendarService,
    private integrationsService: IntegrationsService
  ) {}

  @Post('events')
  async createEvent(@Body() eventData: any) {
    // Get user's Google integration
    const integration = await this.integrationsService.getActiveIntegration('google');

    this.googleCalendarService.setCredentials(
      integration.credentials.accessToken,
      integration.credentials.refreshToken
    );

    return await this.googleCalendarService.createEvent(eventData, true);
  }

  @Get('events')
  async listEvents() {
    const integration = await this.integrationsService.getActiveIntegration('google');

    this.googleCalendarService.setCredentials(
      integration.credentials.accessToken,
      integration.credentials.refreshToken
    );

    return await this.googleCalendarService.listEvents();
  }

  @Get('events/today')
  async getTodaysEvents() {
    const integration = await this.integrationsService.getActiveIntegration('google');

    this.googleCalendarService.setCredentials(
      integration.credentials.accessToken,
      integration.credentials.refreshToken
    );

    return await this.googleCalendarService.getTodaysEvents();
  }

  @Delete('events/:id')
  async deleteEvent(@Param('id') eventId: string) {
    const integration = await this.integrationsService.getActiveIntegration('google');

    this.googleCalendarService.setCredentials(
      integration.credentials.accessToken,
      integration.credentials.refreshToken
    );

    await this.googleCalendarService.deleteEvent(eventId);
    return { success: true };
  }
}
```

#### 3. Add Slack Bot Commands

**File**: `backend/src/integrations/handlers/slack.handler.ts`

Add these slash commands:

```typescript
async handleSlashCommand(command: string, text: string, userId: string) {
  switch (command) {
    case '/calendar':
      return this.handleCalendarCommand(text, userId);
    case '/meet':
      return this.handleMeetCommand(text, userId);
    default:
      return { text: 'Unknown command' };
  }
}

private async handleCalendarCommand(text: string, userId: string) {
  const args = text.split(' ');
  const action = args[0];

  const integration = await this.getGoogleIntegration(userId);
  this.googleCalendarService.setCredentials(
    integration.credentials.accessToken,
    integration.credentials.refreshToken
  );

  switch (action) {
    case 'list':
      const events = await this.googleCalendarService.getWeekEvents();
      return this.formatEventsResponse(events);

    case 'today':
      const todayEvents = await this.googleCalendarService.getTodaysEvents();
      return this.formatEventsResponse(todayEvents);

    case 'create':
      const eventText = args.slice(1).join(' ');
      const newEvent = await this.googleCalendarService.quickAddEvent(eventText);
      return { text: `Created event: ${newEvent.summary}` };

    default:
      return {
        text: `Usage:
/calendar list - Show upcoming events
/calendar today - Show today's events
/calendar create <text> - Quick create event
Example: /calendar create Meeting with John tomorrow at 3pm`
      };
  }
}

private async handleMeetCommand(text: string, userId: string) {
  const args = text.split(' ');
  const action = args[0];

  const integration = await this.getGoogleIntegration(userId);
  this.googleCalendarService.setCredentials(
    integration.credentials.accessToken,
    integration.credentials.refreshToken
  );

  switch (action) {
    case 'create':
      const eventText = args.slice(1).join(' ');
      const event = await this.googleCalendarService.quickAddEvent(eventText);
      const withMeet = await this.googleCalendarService.addMeetToEvent(event.id);
      return {
        text: `Created meeting: ${withMeet.summary}\\nJoin link: ${withMeet.hangoutLink}`
      };

    default:
      return {
        text: `Usage:
/meet create <text> - Create event with Google Meet
Example: /meet create Daily standup tomorrow at 9am`
      };
  }
}
```

#### 4. Update Integration Module

**File**: `backend/src/integrations/integrations.module.ts`

Add GoogleCalendarService to providers:

```typescript
providers: [
  // ... existing providers
  GoogleCalendarService,
],
exports: [
  // ... existing exports
  GoogleCalendarService,
],
```

### Frontend (Estimated: 1-2 hours)

#### 1. Update Calendar Page

**File**: `frontend/app/(dashboard)/calendar/page.tsx`

```typescript
import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Add to existing page
const [googleEvents, setGoogleEvents] = useState([]);

const fetchGoogleEvents = async () => {
  try {
    const response = await api.get('/calendar/events');
    setGoogleEvents(response.data);
  } catch (error) {
    console.error('Failed to fetch Google Calendar events:', error);
  }
};

useEffect(() => {
  fetchGoogleEvents();
}, []);

// Display Google events in calendar grid
{googleEvents.map(event => (
  <div key={event.id} className="text-xs px-2 py-1 rounded bg-blue-500 text-white">
    {event.summary}
    {event.hangoutLink && (
      <a href={event.hangoutLink} className="ml-2 underline">
        Join Meet
      </a>
    )}
  </div>
))}
```

#### 2. Add Sync Button

```typescript
<button
  onClick={fetchGoogleEvents}
  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
>
  <RefreshCw className="h-4 w-4" />
  Sync Google Calendar
</button>
```

## 🎯 Slack Commands Usage

Once implemented, users can:

```bash
# In Slack
/calendar list             # Show next 7 days
/calendar today            # Show today's events
/calendar create Meeting with Sarah tomorrow at 2pm  # Quick create
/meet create Team sync next Monday at 10am           # Create with Google Meet
```

## 🔒 Security Notes

1. **Never commit credentials** - Use environment variables
2. **Refresh tokens** - GoogleCalendarService handles token refresh automatically
3. **Scopes** - Only request necessary Google Calendar scopes
4. **Webhook security** - Validate Google webhook signatures

## 📚 Google Calendar API Resources

- [Google Calendar API Docs](https://developers.google.com/calendar/api/v3/reference)
- [OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Google Meet API](https://developers.google.com/calendar/api/guides/create-events#conferencing)

## 🚀 Deployment

After implementation:

1. Test locally with `npm run start:dev`
2. Build: `npm run build`
3. Deploy to Fly.io: `flyctl deploy -a slackcrm-backend`
4. Deploy frontend to Netlify (auto-deploys on push)

## 💡 Future Enhancements

- Calendar sync scheduling (every hour)
- Bi-directional sync (CRM events → Google Calendar)
- Calendar sharing between team members
- Meeting analytics and reporting
- Automated meeting notes creation
- Integration with Zoom as alternative to Google Meet

---

**Status**: Foundation complete, ready for integration
**Estimated completion time**: 3-5 hours development + testing
