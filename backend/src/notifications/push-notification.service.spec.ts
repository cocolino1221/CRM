import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PushNotificationService } from './push-notification.service';
import { User } from '../database/entities/user.entity';
import { DeviceToken } from '../database/entities/device-token.entity';
import { NotificationType } from '../database/entities/notification.entity';

describe('PushNotificationService gating', () => {
  async function build(user: any) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn().mockResolvedValue(user) } },
        { provide: getRepositoryToken(DeviceToken), useValue: { find: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();
    const svc = moduleRef.get(PushNotificationService);
    (svc as any).apnsEnabled = true; // pass the early "no push transport" guard
    return svc;
  }

  it('suppresses when the category is disabled', async () => {
    const user = { id: 'u1', preferences: { notifications: { push: { 'message:instagram': false } } } };
    const svc = await build(user);
    const findSpy = jest.spyOn((svc as any).deviceTokenRepository ?? {}, 'find');
    await svc.sendPushToUser('u1', { type: NotificationType.WHATSAPP, title: 't', message: 'm', category: 'message:instagram' });
    // No tokens fetched because we returned before the token query.
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('sends (reaches token query) when category enabled and outside quiet hours', async () => {
    const user = { id: 'u1', preferences: { notifications: { push: { 'message:instagram': true } } } };
    const svc = await build(user);
    const findSpy = jest.spyOn((svc as any).deviceTokenRepository, 'find');
    await svc.sendPushToUser('u1', { type: NotificationType.WHATSAPP, title: 't', message: 'm', category: 'message:instagram' });
    expect(findSpy).toHaveBeenCalled();
  });
});
