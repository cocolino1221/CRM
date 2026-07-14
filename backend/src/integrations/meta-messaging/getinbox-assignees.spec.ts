import { MetaMessagingService } from './meta-messaging.service';
import { ActivityDirection, ActivityOutcome, ActivityType } from '../../database/entities/activity.entity';
import { ContactSource } from '../../database/entities/contact.entity';

function createQueryBuilderMock(getManyResult: any[]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(getManyResult),
  };
  return qb;
}

describe('MetaMessagingService.getInbox — setter/closer exposure (Task 7)', () => {
  let service: MetaMessagingService;
  let activityRepository: any;
  let integrationRepository: any;
  let workspaceRepository: any;

  const baseActivity = (overrides: any = {}) => ({
    id: 'activity-1',
    workspaceId: 'ws-1',
    type: ActivityType.OTHER,
    direction: ActivityDirection.INBOUND,
    outcome: ActivityOutcome.SUCCESSFUL,
    description: 'Hello there',
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    metadata: {
      channel: 'messenger',
      externalUserId: 'sender-1',
      externalThreadId: 'sender-1',
      messageType: 'text',
    },
    ...overrides,
  });

  beforeEach(() => {
    activityRepository = {
      createQueryBuilder: jest.fn(),
    };
    integrationRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    workspaceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'ws-1', settings: {} }),
    };

    service = new MetaMessagingService(
      { axiosRef: { get: jest.fn() } } as any,
      { get: jest.fn() } as any,
      { createQueryBuilder: jest.fn(), findOne: jest.fn() } as any,
      activityRepository,
      integrationRepository,
      { findOne: jest.fn() } as any,
      workspaceRepository,
      { notifyMessage: jest.fn() } as any,
      { emit: jest.fn() } as any,
    );
  });

  it('exposes setterId/setterName/closerId/closerName when the contact has both assigned', async () => {
    const activity = baseActivity({
      contact: {
        id: 'contact-1',
        source: ContactSource.FACEBOOK,
        setterId: 'user-setter-1',
        setter: { firstName: 'Sara', lastName: 'Setter', email: 'sara@example.com' },
        closerId: 'user-closer-1',
        closer: { firstName: 'Cody', lastName: 'Closer', email: 'cody@example.com' },
      },
    });

    activityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock([activity]));

    const result = await service.getInbox('ws-1');

    expect(result.data).toHaveLength(1);
    const conversation = result.data[0];
    expect(conversation.setterId).toBe('user-setter-1');
    expect(conversation.setterName).toBe('Sara Setter');
    expect(conversation.closerId).toBe('user-closer-1');
    expect(conversation.closerName).toBe('Cody Closer');
  });

  it('returns null setter/closer fields when the contact has none assigned', async () => {
    const activity = baseActivity({
      contact: {
        id: 'contact-2',
        source: ContactSource.INSTAGRAM,
        setterId: null,
        setter: null,
        closerId: null,
        closer: null,
      },
      metadata: {
        channel: 'instagram',
        externalUserId: 'sender-2',
        externalThreadId: 'sender-2',
        messageType: 'text',
      },
    });

    activityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock([activity]));

    const result = await service.getInbox('ws-1');

    expect(result.data).toHaveLength(1);
    const conversation = result.data[0];
    expect(conversation.setterId).toBeNull();
    expect(conversation.setterName).toBeNull();
    expect(conversation.closerId).toBeNull();
    expect(conversation.closerName).toBeNull();
  });

  it('returns null setter/closer fields when the activity has no linked contact at all', async () => {
    const activity = baseActivity({ contact: undefined });

    activityRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock([activity]));

    const result = await service.getInbox('ws-1');

    expect(result.data).toHaveLength(1);
    const conversation = result.data[0];
    expect(conversation.setterId).toBeNull();
    expect(conversation.setterName).toBeNull();
    expect(conversation.closerId).toBeNull();
    expect(conversation.closerName).toBeNull();
  });
});
