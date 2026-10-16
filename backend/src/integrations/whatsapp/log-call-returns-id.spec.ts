import { WhatsAppCallingController } from './whatsapp-calling.controller';

/**
 * The disposition dialog opens the moment a call ends and has to address the
 * activity the call just produced. Before this, logCall answered `{success:
 * true}` and the client had no id to update — and no key for its offline draft.
 */
describe('WhatsAppCallingController.logCall', () => {
  const req = { user: { id: 'user-1', workspaceId: 'workspace-1' } };
  const body = { waId: '40712345678', status: 'completed' as const, durationSeconds: 42 };

  function build(logCallActivity: jest.Mock) {
    return new WhatsAppCallingController(
      {} as any,
      { logCallActivity } as any,
      {} as any,
      {} as any,
    );
  }

  it('returns the id of the activity it created', async () => {
    const logCallActivity = jest.fn().mockResolvedValue({ id: 'activity-7' });
    const controller = build(logCallActivity);

    await expect(controller.logCall(req, 'call-1', body)).resolves.toEqual({
      success: true,
      activityId: 'activity-7',
    });
  });

  it('still reports success when no activity could be created', async () => {
    // A call against a contact the workspace does not have yields no activity;
    // the client then falls back to the manual log path rather than erroring.
    const controller = build(jest.fn().mockResolvedValue(null));

    await expect(controller.logCall(req, 'call-1', body)).resolves.toEqual({
      success: true,
      activityId: null,
    });
  });

  it('passes the call details through to the service', async () => {
    const logCallActivity = jest.fn().mockResolvedValue({ id: 'activity-7' });
    const controller = build(logCallActivity);

    await controller.logCall(req, 'call-1', { ...body, recordingUrl: 'https://r2/rec.mp3' });

    expect(logCallActivity).toHaveBeenCalledWith(
      'workspace-1',
      '40712345678',
      expect.objectContaining({
        callId: 'call-1',
        status: 'completed',
        durationSeconds: 42,
        recordingUrl: 'https://r2/rec.mp3',
        ownerId: 'user-1',
      }),
    );
  });
});
