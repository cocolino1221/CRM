import { GoogleIntegrationHandler } from './google.handler';

describe('GoogleIntegrationHandler', () => {
  it('encodes sheet ranges before placing them in the request URL', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { range: "'IULIE / 2026'!A1:AZ1", values: [] },
    });
    const handler = new GoogleIntegrationHandler(
      { axiosRef: { get } } as any,
      {} as any,
    );
    const range = "'IULIE / 2026'!A1:AZ1";

    await handler.getSheetData(
      { credentials: { accessToken: 'test-token' } } as any,
      'spreadsheet-id',
      range,
    );

    expect(get).toHaveBeenCalledWith(
      `https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-id/values/${encodeURIComponent(range)}`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  // Without sendUpdates the Calendar API notifies nobody: the lead was an
  // attendee on a meeting they were never told about, left to find the
  // "add to calendar" link in our own email instead.
  it('asks Google to invite the attendees of a Meet booking', async () => {
    const request = jest.fn().mockResolvedValue({ data: { id: 'evt-1' } });
    const handler = new GoogleIntegrationHandler(
      { axiosRef: { request } } as any,
      {} as any,
    );

    await handler.createMeetEvent({ credentials: { accessToken: 'test-token' } } as any, {
      summary: 'Discuție — Ioana',
      startTime: '2026-10-23T09:00:00.000Z',
      endTime: '2026-10-23T09:30:00.000Z',
      attendeeEmails: ['ioana@exemplu.ro'],
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        params: expect.objectContaining({ sendUpdates: 'all', conferenceDataVersion: '1' }),
        data: expect.objectContaining({ attendees: [{ email: 'ioana@exemplu.ro' }] }),
      }),
    );
  });
});
