import { NotificationsService } from './notifications.service';

describe('preferences persistence', () => {
  it('merges push map + quietHours into user.preferences.notifications', async () => {
    const user = { id: 'u1', preferences: { theme: 'dark' } };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };
    const svc = new NotificationsService({} as any, {} as any, {} as any, userRepo as any);
    const res = await svc.setPreferences('u1', {
      push: { 'lead:typeform': false },
      quietHours: { enabled: true, start: '22:00', end: '08:00', timezone: 'Europe/Bucharest' },
    });
    expect(res.push['lead:typeform']).toBe(false);
    expect(res.quietHours.enabled).toBe(true);
    // theme preserved, notifications nested under preferences
    expect(userRepo.save.mock.calls[0][0].preferences.theme).toBe('dark');
    expect(userRepo.save.mock.calls[0][0].preferences.notifications.push['lead:typeform']).toBe(false);
  });
});
