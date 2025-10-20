import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string }>;
  conferenceData?: any;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauth2Client: OAuth2Client;

  constructor(private configService: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL') || 'http://localhost:3000/api/v1/integrations/google/callback',
    );
  }

  /**
   * Set access token for authenticated requests
   */
  setCredentials(accessToken: string, refreshToken?: string) {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Create calendar event with optional Google Meet link
   */
  async createEvent(event: CalendarEvent, withMeet = false): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const eventData: calendar_v3.Schema$Event = {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        attendees: event.attendees,
        reminders: event.reminders || {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 },
          ],
        },
      };

      // Add Google Meet conference if requested
      if (withMeet) {
        eventData.conferenceData = {
          createRequest: {
            requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventData,
        conferenceDataVersion: withMeet ? 1 : 0,
        sendUpdates: 'all',
      });

      this.logger.log(`Created calendar event: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create event: ${error.message}`);
      throw error;
    }
  }

  /**
   * List upcoming calendar events
   */
  async listEvents(options: {
    maxResults?: number;
    timeMin?: string;
    timeMax?: string;
    q?: string;
  } = {}): Promise<calendar_v3.Schema$Event[]> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: options.timeMin || new Date().toISOString(),
        timeMax: options.timeMax,
        maxResults: options.maxResults || 50,
        singleEvents: true,
        orderBy: 'startTime',
        q: options.q,
      });

      return response.data.items || [];
    } catch (error) {
      this.logger.error(`Failed to list events: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get specific calendar event
   */
  async getEvent(eventId: string): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventId,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update calendar event
   */
  async updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      // Get current event first
      const currentEvent = await this.getEvent(eventId);

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: {
          ...currentEvent,
          ...updates,
        },
        sendUpdates: 'all',
      });

      this.logger.log(`Updated calendar event: ${eventId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: 'all',
      });

      this.logger.log(`Deleted calendar event: ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to delete event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add Google Meet to existing event
   */
  async addMeetToEvent(eventId: string): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const currentEvent = await this.getEvent(eventId);

      const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        conferenceDataVersion: 1,
        requestBody: {
          conferenceData: {
            createRequest: {
              requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
        sendUpdates: 'all',
      });

      this.logger.log(`Added Google Meet to event: ${eventId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to add Meet to event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get upcoming events for today
   */
  async getTodaysEvents(): Promise<calendar_v3.Schema$Event[]> {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.listEvents({
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
    });
  }

  /**
   * Get events for this week
   */
  async getWeekEvents(): Promise<calendar_v3.Schema$Event[]> {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 7);

    return this.listEvents({
      timeMin: now.toISOString(),
      timeMax: endOfWeek.toISOString(),
    });
  }

  /**
   * Quick create event from natural language
   * Example: "Meeting with John tomorrow at 3pm"
   */
  async quickAddEvent(text: string): Promise<calendar_v3.Schema$Event> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.quickAdd({
        calendarId: 'primary',
        text: text,
        sendUpdates: 'all',
      });

      this.logger.log(`Quick added event: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to quick add event: ${error.message}`);
      throw error;
    }
  }
}
