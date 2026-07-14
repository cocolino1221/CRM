import { MetaMessagingService } from './meta-messaging.service';
import { IntegrationType } from '../../database/entities/integration.entity';

function createQueryBuilderMock(overrides: Partial<Record<string, any>> = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(overrides.getOne ?? null),
    getMany: jest.fn().mockResolvedValue(overrides.getMany ?? []),
    getExists: jest.fn().mockResolvedValue(overrides.getExists ?? false),
    execute: jest.fn().mockResolvedValue(overrides.execute ?? { affected: 0 }),
  };
  return qb;
}

describe('MetaMessagingService — inbound push notification wiring (Task 6)', () => {
  let service: MetaMessagingService;
  let notificationsService: { notifyMessage: jest.Mock };
  let contactRepository: any;
  let activityRepository: any;
  let integrationRepository: any;

  const baseIntegration = (provider: 'facebook' | 'instagram') => ({
    id: 'integration-1',
    workspaceId: 'ws-1',
    userId: 'owner-1',
    type: IntegrationType.API,
    config: { provider, pageId: 'page-1', pageName: 'Test Page' },
    credentials: {},
  });

  beforeEach(() => {
    notificationsService = {
      notifyMessage: jest.fn().mockReturnValue(Promise.resolve()),
    };

    contactRepository = {
      createQueryBuilder: jest.fn(() => createQueryBuilderMock({ getOne: null })),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: any) => ({ id: 'contact-1', firstName: 'John', lastName: '', ...data })),
      save: jest.fn((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'contact-1' })),
    };

    activityRepository = {
      createQueryBuilder: jest.fn(() => createQueryBuilderMock({ getExists: false })),
      create: jest.fn((data: any) => ({ id: 'activity-1', ...data })),
      save: jest.fn((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'activity-1' })),
    };

    integrationRepository = {
      findOne: jest.fn(),
    };

    service = new MetaMessagingService(
      { axiosRef: { get: jest.fn().mockRejectedValue(new Error('no network in test')) } } as any,
      { get: jest.fn() } as any,
      contactRepository,
      activityRepository,
      integrationRepository,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      notificationsService as any,
      { emit: jest.fn() } as any,
    );
  });

  it('notifies with channel "facebook" for an inbound Messenger message', async () => {
    integrationRepository.findOne.mockResolvedValue(baseIntegration('facebook'));

    await service.handleWebhook('facebook', 'integration-1', {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: 'page-1' },
              message: { mid: 'mid-1', text: 'Hello there' },
            },
          ],
        },
      ],
    });

    expect(notificationsService.notifyMessage).toHaveBeenCalledTimes(1);
    expect(notificationsService.notifyMessage).toHaveBeenCalledWith(
      'ws-1',
      'owner-1',
      'facebook',
      expect.stringContaining('Messenger'),
      'Hello there',
      expect.objectContaining({ channel: 'messenger', externalUserId: 'sender-1', contactId: 'contact-1' }),
    );
  });

  it('notifies with channel "instagram" for an inbound Instagram message', async () => {
    integrationRepository.findOne.mockResolvedValue(baseIntegration('instagram'));

    await service.handleWebhook('instagram', 'integration-1', {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'sender-2' },
              recipient: { id: 'ig-1' },
              message: { mid: 'mid-2', text: 'Hi from IG' },
            },
          ],
        },
      ],
    });

    expect(notificationsService.notifyMessage).toHaveBeenCalledTimes(1);
    expect(notificationsService.notifyMessage).toHaveBeenCalledWith(
      'ws-1',
      'owner-1',
      'instagram',
      expect.stringContaining('Instagram'),
      'Hi from IG',
      expect.objectContaining({ channel: 'instagram', externalUserId: 'sender-2', contactId: 'contact-1' }),
    );
  });

  it('does NOT notify for an echo (outbound) event', async () => {
    integrationRepository.findOne.mockResolvedValue(baseIntegration('facebook'));

    await service.handleWebhook('facebook', 'integration-1', {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'page-1' },
              recipient: { id: 'sender-1' },
              message: { mid: 'mid-echo-1', text: 'Echo of our own send', is_echo: true },
            },
          ],
        },
      ],
    });

    expect(notificationsService.notifyMessage).not.toHaveBeenCalled();
  });

  it('does NOT notify for a non-message event (e.g. delivery receipt)', async () => {
    integrationRepository.findOne.mockResolvedValue(baseIntegration('facebook'));

    await service.handleWebhook('facebook', 'integration-1', {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: 'page-1' },
              delivery: { mids: ['mid-1'], watermark: 123 },
            },
          ],
        },
      ],
    });

    expect(notificationsService.notifyMessage).not.toHaveBeenCalled();
  });
});
