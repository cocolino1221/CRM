import { ActivitiesService } from './activities.service';

/**
 * What the call outcome tells Meta. The transaction is stubbed: these tests
 * are about the event sent afterwards, not about what is written.
 */
describe('ActivitiesService — outcome events to Meta', () => {
  const contact = { id: 'c1', workspaceId: 'ws', email: 'a@b.ro' };
  const build = () => {
    const reportStageChange = jest.fn().mockResolvedValue(undefined);
    const dataSource: any = {
      transaction: jest.fn(async () => ({ id: 'act-1', contactId: 'c1' })),
      getRepository: () => ({ findOne: jest.fn().mockResolvedValue(contact) }),
    };
    const service = new ActivitiesService({} as any, dataSource, { reportStageChange } as any);
    return { service, reportStageChange };
  };
  const flush = () => new Promise((r) => setImmediate(r));

  it('sends Vandut for a sale, once per call', async () => {
    const { service, reportStageChange } = build();
    await service.applyDisposition('ws', 'u1', 'act-1', { outcome: 'successful', deal: { value: 100 } } as any);
    await flush();
    expect(reportStageChange).toHaveBeenCalledWith(contact, 'Vandut', 'act-1:Vandut');
  });

  it('sends Pierdut and Programat', async () => {
    const { service, reportStageChange } = build();
    await service.applyDisposition('ws', 'u1', 'act-1', { outcome: 'failed' } as any);
    await service.applyDisposition('ws', 'u1', 'act-1', { outcome: 'scheduled' } as any);
    await flush();
    expect(reportStageChange.mock.calls.map((c) => c[1])).toEqual(['Pierdut', 'Programat']);
  });

  it('sends nothing for a note', async () => {
    const { service, reportStageChange } = build();
    await service.applyDisposition('ws', 'u1', 'act-1', { outcome: 'successful' } as any);
    await flush();
    expect(reportStageChange).not.toHaveBeenCalled();
  });

  it('still saves when Meta is not connected', async () => {
    const dataSource: any = { transaction: jest.fn(async () => ({ id: 'act-1', contactId: 'c1' })) };
    const service = new ActivitiesService({} as any, dataSource);
    await expect(service.applyDisposition('ws', 'u1', 'act-1', { outcome: 'failed' } as any)).resolves.toMatchObject({ id: 'act-1' });
  });
});
