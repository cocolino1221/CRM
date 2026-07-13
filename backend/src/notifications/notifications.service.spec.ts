import { NotificationsService } from './notifications.service';
import { NotificationType } from '../database/entities/notification.entity';

describe('NotificationsService category tagging', () => {
  it('forwards category to push and stores it in metadata', async () => {
    const saved = { id: 'n1' };
    const notifRepo = { create: (x: any) => x, save: jest.fn().mockResolvedValue(saved) };
    const push = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };
    const svc = new NotificationsService(notifRepo as any, {} as any, push as any, {} as any);

    await svc.notifyMessage('ws', 'u1', 'instagram', 'New IG message', 'Hi');

    const savedArg = notifRepo.save.mock.calls[0][0];
    expect(savedArg.metadata.category).toBe('message:instagram');
    expect(savedArg.type).toBe(NotificationType.WHATSAPP); // social messages reuse the messaging type
    const pushArg = push.sendPushToUser.mock.calls[0][1];
    expect(pushArg.category).toBe('message:instagram');
  });
});
