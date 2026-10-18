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
});
