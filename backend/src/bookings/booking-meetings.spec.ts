import {
  BookingMeetingsService,
  chooseProvider,
  googleCalendarUrl,
  isDeliverableEmail,
  normalizeProvider,
} from './booking-meetings.service';
import { IntegrationType } from '../database/entities/integration.entity';

const START = new Date('2026-11-02T10:00:00.000Z');
const END = new Date('2026-11-02T10:30:00.000Z');

function booking(overrides: any = {}) {
  return {
    id: 'b1',
    workspaceId: 'ws',
    startTime: START,
    endTime: END,
    duration: 30,
    timezone: 'Europe/Bucharest',
    locationType: 'zoom',
    location: null,
    externalMeetingId: null,
    guestName: 'Ana Pop',
    guestEmail: 'ana@client.ro',
    guestPhone: '0722000000',
    host: { id: 'h1', firstName: 'Ioana', lastName: 'R', email: 'ioana@firma.ro', preferences: {} },
    contact: null,
    meetingType: { name: 'Consultație', locationType: 'zoom' },
    ...overrides,
  };
}

function build(options: { booking?: any; google?: boolean; zoom?: boolean } = {}) {
  const row = options.booking ?? booking();
  const bookingRepository = {
    findOne: jest.fn().mockResolvedValue(row),
    save: jest.fn(async (b: any) => b),
  };
  const integrations: Record<string, any> = {
    [IntegrationType.GOOGLE]: options.google ? { id: 'g', workspaceId: 'ws' } : null,
    [IntegrationType.ZOOM]: options.zoom ? { id: 'z', workspaceId: 'ws' } : null,
  };
  const integrationRepository = {
    findOne: jest.fn(async ({ where }: any) => integrations[where.type] ?? null),
  };
  const workspaceRepository = { findOne: jest.fn().mockResolvedValue({ settings: {} }) };
  const googleHandler = {
    createMeetEvent: jest.fn().mockResolvedValue({ id: 'evt1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }),
    deleteCalendarEvent: jest.fn().mockResolvedValue(undefined),
  };
  const zoomHandler = {
    createMeetingForIntegration: jest.fn().mockResolvedValue({ id: 987, join_url: 'https://zoom.us/j/987' }),
    deleteMeetingForIntegration: jest.fn().mockResolvedValue(undefined),
  };
  const emailService = { sendEmail: jest.fn().mockResolvedValue(true) };
  const configService = { get: jest.fn().mockReturnValue('noreply@firma.ro') };

  const service = new BookingMeetingsService(
    bookingRepository as any,
    integrationRepository as any,
    workspaceRepository as any,
    googleHandler as any,
    zoomHandler as any,
    emailService as any,
    configService as any,
  );
  return { service, row, bookingRepository, googleHandler, zoomHandler, emailService };
}

describe('choosing the platform', () => {
  const both = { google_meet: true, zoom: true };

  it('uses what was asked for when it is connected', () => {
    expect(chooseProvider(both, 'zoom', 'google_meet')).toBe('zoom');
  });

  it('falls back to the closer preference, then Meet, then Zoom', () => {
    expect(chooseProvider(both, undefined, 'zoom')).toBe('zoom');
    expect(chooseProvider(both)).toBe('google_meet');
    expect(chooseProvider({ google_meet: false, zoom: true }, 'google_meet')).toBe('zoom');
  });

  it('never picks a platform that is not connected', () => {
    expect(chooseProvider({ google_meet: false, zoom: false }, 'zoom', 'google_meet')).toBe('none');
  });

  it('respects an explicit "no link"', () => {
    expect(chooseProvider(both, 'none')).toBe('none');
  });

  it('reads the older spellings', () => {
    expect(normalizeProvider('meet')).toBe('google_meet');
    expect(normalizeProvider('phone')).toBe('none');
    expect(normalizeProvider('')).toBeUndefined();
  });
});

describe('who can be emailed', () => {
  it('skips the made-up addresses Meta and WhatsApp leads get', () => {
    expect(isDeliverableEmail('messenger.123@meta.placeholder.invalid')).toBe(false);
    expect(isDeliverableEmail('40722@whatsapp.placeholder.invalid')).toBe(false);
    expect(isDeliverableEmail('not-an-email')).toBe(false);
    expect(isDeliverableEmail('ana@client.ro')).toBe(true);
  });

  it('builds an add-to-calendar link for the lead', () => {
    expect(googleCalendarUrl('Consultație', START, END, 'x')).toContain('dates=20261102T100000Z%2F20261102T103000Z');
  });
});

describe('setting up a booking meeting', () => {
  it('creates a Google Meet, stores it and emails the lead and the closer', async () => {
    const { service, row, googleHandler, emailService } = build({ google: true });
    const out = await service.setUpMeeting('b1', 'google_meet');

    expect(out).toMatchObject({ provider: 'google_meet', link: 'https://meet.google.com/abc-defg-hij', emailed: { lead: true, host: true } });
    expect(googleHandler.createMeetEvent.mock.calls[0][1].attendeeEmails).toEqual(['ioana@firma.ro', 'ana@client.ro']);
    expect(row).toMatchObject({ locationType: 'google_meet', location: 'https://meet.google.com/abc-defg-hij', externalMeetingId: 'evt1' });
    const recipients = emailService.sendEmail.mock.calls.map((c: any[]) => c[0].to);
    expect(recipients).toEqual(['ana@client.ro', 'ioana@firma.ro']);
    expect(emailService.sendEmail.mock.calls[0][0].html).toContain('https://meet.google.com/abc-defg-hij');
  });

  it('follows the closer preference when nothing was asked for', async () => {
    const { service, row } = build({
      google: true,
      zoom: true,
      booking: booking({ host: { id: 'h1', email: 'ioana@firma.ro', preferences: { meetingProvider: 'zoom' } } }),
    });
    const out = await service.setUpMeeting('b1');
    expect(out.provider).toBe('zoom');
    expect(row.externalMeetingId).toBe('987');
  });

  it('keeps the booking and warns when Google fails, emailing nobody', async () => {
    const { service, googleHandler, emailService } = build({ google: true });
    googleHandler.createMeetEvent.mockRejectedValueOnce(new Error('invalid_grant'));
    const out = await service.setUpMeeting('b1', 'google_meet');
    expect(out.provider).toBe('none');
    expect(out.link).toBeUndefined();
    expect(out.warning).toMatch(/Google/);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('emails only the closer when the lead has a placeholder address', async () => {
    const { service, emailService } = build({
      google: true,
      booking: booking({ guestEmail: null, contact: { firstName: 'X', email: 'm.1@meta.placeholder.invalid' } }),
    });
    const out = await service.setUpMeeting('b1', 'google_meet');
    expect(out.emailed).toEqual({ lead: false, host: true });
    expect(emailService.sendEmail.mock.calls.map((c: any[]) => c[0].to)).toEqual(['ioana@firma.ro']);
  });

  it('defaults to Google Meet, not the meeting type\'s unchosen "zoom"', async () => {
    const { service } = build({ google: true, zoom: true });
    const out = await service.setUpMeeting('b1');
    expect(out.provider).toBe('google_meet');
  });

  it('warns when the chosen platform is not connected', async () => {
    const { service, emailService } = build();
    const out = await service.setUpMeeting('b1', 'zoom');
    expect(out.provider).toBe('none');
    expect(out.warning).toBeDefined();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  // The quiet failure: book without naming a platform while none is
  // connected, and the booking used to come back clean — no link, no email
  // to either side, and nothing on screen to say so.
  it('warns when nothing is connected and no platform was asked for', async () => {
    const { service, emailService } = build();
    const out = await service.setUpMeeting('b1');
    expect(out.provider).toBe('none');
    expect(out.link).toBeUndefined();
    expect(out.warning).toContain('Nicio platformă');
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('uses a meeting type\'s fixed link instead of creating one', async () => {
    const { service, zoomHandler, emailService } = build({
      zoom: true,
      booking: booking({ location: 'https://zoom.us/my/ioana' }),
    });
    const out = await service.setUpMeeting('b1');
    expect(out.link).toBe('https://zoom.us/my/ioana');
    expect(zoomHandler.createMeetingForIntegration).not.toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('escapes names in the email', async () => {
    const { service, emailService } = build({ google: true, booking: booking({ guestName: '<script>x</script>' }) });
    await service.setUpMeeting('b1', 'google_meet');
    expect(emailService.sendEmail.mock.calls[0][0].html).not.toContain('<script>');
  });
});

describe('cancelling and moving', () => {
  it('deletes the Zoom meeting of a cancelled booking', async () => {
    const { service, zoomHandler } = build({ zoom: true });
    await service.cancelMeeting(booking({ locationType: 'zoom', externalMeetingId: '987' }) as any);
    expect(zoomHandler.deleteMeetingForIntegration).toHaveBeenCalledWith(expect.anything(), '987');
  });

  it('replaces the meeting when a booking moves', async () => {
    const moved = booking({ locationType: 'google_meet', location: 'https://meet.google.com/old', externalMeetingId: 'evt0' });
    const { service, googleHandler } = build({ google: true, booking: moved });
    const out = await service.moveMeeting(moved as any);
    expect(googleHandler.deleteCalendarEvent).toHaveBeenCalledWith(expect.anything(), 'evt0');
    expect(out?.link).toBe('https://meet.google.com/abc-defg-hij');
  });
});
