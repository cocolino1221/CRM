# Calendar System - Full Implementation Guide

## Overview
Complete calendar system with HubSpot/ClickUp-level features including:
- Team calendar views
- Meeting scheduling with auto-sync
- Zoom/Google Meet integration
- Calendly replacement functionality
- Role-based booking (setters schedule for closers)

## Backend Components

### 1. Event Entity (`/backend/src/database/entities/event.entity.ts`)
✅ CREATED - Comprehensive event model with:
- Multiple event types (meeting, call, task, deadline, appointment)
- Meeting platform support (Zoom, Google Meet, Teams)
- Recurring events
- Attendee management
- External calendar sync (Google Calendar, Outlook)
- Calendly integration fields

### 2. Events Module Files TO CREATE:

#### `/backend/src/events/dto/update-event.dto.ts`
```typescript
export class UpdateEventDto extends PartialType(CreateEventDto) {}
```

#### `/backend/src/events/dto/query-events.dto.ts`
```typescript
// Filters: date range, type, status, attendees, team view
```

#### `/backend/src/events/events.service.ts`
Key methods:
- `create()` - Create event + auto-add to attendee calendars
- `findAll()` - Query with filters + team calendar view
- `findTeamCalendar()` - Admin view of all team calendars
- `generateMeetingLink()` - Create Zoom/Google Meet links
- `handleCalendlyWebhook()` - Process Calendly bookings
- `scheduleForUser()` - Setter books meeting for closer

#### `/backend/src/events/events.controller.ts`
Endpoints:
- `POST /events` - Create event
- `GET /events` - List events (with team view query param)
- `GET /events/team` - Team calendar (admin only)
- `POST /events/:id/meeting-link` - Generate meeting link
- `POST /webhooks/calendly` - Calendly webhook
- `POST /events/schedule-for/:userId` - Book for team member

#### `/backend/src/events/events.module.ts`
Import Event, User, Contact, Deal entities

### 3. Database Migration
```bash
npm run migration:generate -- src/database/migrations/CreateEventsTable
npm run migration:run
```

## Frontend Components

### 1. Updated Calendar Page (`/frontend/app/(dashboard)/calendar/page.tsx`)
Features to add:
- API integration (replace mock data)
- Event creation form with all fields
- Team calendar toggle (admin only)
- Meeting platform selector with auto-link generation
- Attendee multi-select
- Recurring event UI
- Calendar sync indicators

### 2. New: Meeting Scheduler Component
Path: `/frontend/components/MeetingScheduler.tsx`
- Book meetings for team members
- Available time slots
- Automatic Zoom/Google Meet link creation
- Email notifications

### 3. New: Team Calendar View
Path: `/frontend/components/TeamCalendar.tsx`
- Side-by-side calendars for all team members
- Color-coded by user
- Filter by role (setters, callers, closers)
- Click to view event details

## Integration Features

### Calendly Webhook Integration
1. Webhook endpoint: `POST /api/v1/webhooks/calendly`
2. Automatically creates events when Calendly bookings are made
3. Maps Calendly event to CRM contact
4. Assigns to correct team member based on event type

### Zoom Integration
Uses Zoom API to:
- Generate meeting links
- Create instant meetings
- Get join URLs
- Store meeting ID and password

### Google Meet Integration
Uses Google Calendar API to:
- Create Google Meet links
- Add to Google Calendar
- Sync attendees

## Deployment Steps

1. Deploy backend with new Event entity
2. Run database migrations
3. Deploy updated frontend
4. Configure Calendly webhook URL
5. Set up Zoom/Google OAuth credentials

## Environment Variables Needed
```
ZOOM_API_KEY=
ZOOM_API_SECRET=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
CALENDLY_WEBHOOK_SECRET=
```

## Usage Examples

### Admin Views All Team Calendars
```
GET /api/v1/events?view=team&startDate=2025-01-01&endDate=2025-01-31
```

### Setter Books Meeting for Closer
```
POST /api/v1/events/schedule-for/closer-user-id
{
  "title": "Demo with Acme Corp",
  "startDate": "2025-01-15T14:00:00Z",
  "endDate": "2025-01-15T15:00:00Z",
  "contactId": "contact-uuid",
  "meetingPlatform": "zoom",
  "generateMeetingLink": true
}
```

Response includes Zoom link automatically generated.

### Calendly Webhook Receives Booking
```
POST /api/v1/webhooks/calendly
{
  "event": "invitee.created",
  "payload": {
    "event_type": "demo_call",
    "invitee": { "email": "john@example.com" },
    "scheduled_event": {
      "start_time": "2025-01-20T10:00:00Z",
      "end_time": "2025-01-20T10:30:00Z"
    }
  }
}
```

Automatically creates event in CRM and assigns to available closer.
