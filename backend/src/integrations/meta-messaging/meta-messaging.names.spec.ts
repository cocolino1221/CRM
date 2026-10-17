import { MetaMessagingService } from './meta-messaging.service';

describe('MetaMessagingService — sender names', () => {
  let service: any;
  let httpGet: jest.Mock;

  beforeEach(() => {
    httpGet = jest.fn();
    service = new MetaMessagingService(
      { axiosRef: { get: httpGet } } as any,
      { get: jest.fn() } as any,
      { createQueryBuilder: jest.fn(), findOne: jest.fn(), save: jest.fn() } as any,
      { createQueryBuilder: jest.fn() } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { notifyMessage: jest.fn() } as any,
      { emit: jest.fn() } as any,
    );
  });

  describe('fetchConversationParticipantNames', () => {
    const messengerIntegration = {
      id: 'int-fb',
      config: { provider: 'facebook', pageId: 'page-1' },
      credentials: { pageAccessToken: 'tok' },
    };

    beforeEach(() => {
      service.getIntegrationProvider = jest.fn().mockReturnValue('facebook');
      service.ensureFacebookPageCredentials = jest
        .fn()
        .mockResolvedValue({ pageId: 'page-1', pageAccessToken: 'tok' });
    });

    it('collects names across pages and skips the page itself', async () => {
      httpGet
        .mockResolvedValueOnce({
          data: {
            data: [{ participants: { data: [{ id: 'psid-1', name: 'Ana Pop' }, { id: 'page-1', name: 'My Page' }] } }],
            paging: { next: 'https://graph/next' },
          },
        })
        .mockResolvedValueOnce({
          data: { data: [{ participants: { data: [{ id: 'psid-2', name: 'Ion Ionescu' }] } }] },
        });

      const names: Map<string, string> = await service.fetchConversationParticipantNames(messengerIntegration);

      expect([...names.entries()]).toEqual([
        ['psid-1', 'Ana Pop'],
        ['psid-2', 'Ion Ionescu'],
      ]);
      expect(httpGet).toHaveBeenCalledTimes(2);
      expect(httpGet.mock.calls[1][0]).toBe('https://graph/next');
    });

    it('uses the Instagram username when there is no name', async () => {
      service.getIntegrationProvider = jest.fn().mockReturnValue('instagram');
      service.ensureInstagramMessagingCredentials = jest
        .fn()
        .mockResolvedValue({ pageId: 'page-1', pageAccessToken: 'tok', igUserId: 'ig-me' });
      httpGet.mockResolvedValueOnce({
        data: { data: [{ participants: { data: [{ id: 'ig-me', username: 'me' }, { id: 'igsid-1', username: 'maria.fit' }] } }] },
      });

      const names: Map<string, string> = await service.fetchConversationParticipantNames({
        id: 'int-ig',
        config: { provider: 'instagram', pageId: 'page-1', igUserId: 'ig-me' },
        credentials: { pageAccessToken: 'tok' },
      });

      expect([...names.entries()]).toEqual([['igsid-1', 'maria.fit']]);
    });

    it('returns what it has when Meta errors instead of throwing', async () => {
      httpGet.mockRejectedValueOnce({ response: { data: { error: { message: 'nope', code: 10 } } } });
      const names: Map<string, string> = await service.fetchConversationParticipantNames(messengerIntegration);
      expect(names.size).toBe(0);
    });
  });

  describe('getContactDisplayName', () => {
    it('prefers a resolved profile name over a placeholder contact name', () => {
      const contact = { firstName: 'Messenger', lastName: 'Contact' };
      expect(service.getContactDisplayName(contact, 'messenger', '123456789', 'Ana Pop')).toBe('Ana Pop');
    });

    it('keeps a real CRM contact name', () => {
      const contact = { firstName: 'Ana', lastName: 'Popescu' };
      expect(service.getContactDisplayName(contact, 'messenger', '123456789', 'ana.p')).toBe('Ana Popescu');
    });

    it('falls back to a short readable label when nothing is known', () => {
      expect(service.getContactDisplayName(undefined, 'messenger', '30334028796241591')).toBe('Contact Messenger ·1591');
      expect(service.getContactDisplayName({ firstName: 'Instagram', lastName: 'Contact' }, 'instagram', '99991234')).toBe(
        'Contact Instagram ·1234',
      );
    });
  });

  describe('fetchSenderProfile fallback', () => {
    const integration = { id: 'int-fb', config: { provider: 'facebook', pageId: 'page-1' }, credentials: {} };

    beforeEach(() => {
      service.ensureFacebookPageCredentials = jest
        .fn()
        .mockResolvedValue({ pageId: 'page-1', pageAccessToken: 'tok' });
    });

    it('reads the name from the thread when the profile endpoint refuses (#100)', async () => {
      httpGet
        .mockRejectedValueOnce({ response: { data: { error: { message: 'No matching user found', code: 100 } } } })
        .mockResolvedValueOnce({
          data: { data: [{ participants: { data: [{ id: 'page-1', name: 'Page' }, { id: 'psid-9', name: 'Ana Pop' }] } }] },
        });

      await expect(service.fetchSenderProfile('facebook', integration, 'psid-9')).resolves.toEqual({ name: 'Ana Pop' });
      expect(httpGet.mock.calls[1][0]).toBe('https://graph.facebook.com/v23.0/page-1/conversations');
      expect(httpGet.mock.calls[1][1].params).toMatchObject({ user_id: 'psid-9', fields: 'participants' });
    });

    it('returns no name when the thread lookup fails too', async () => {
      httpGet
        .mockRejectedValueOnce({ response: { data: { error: { message: 'No matching user found', code: 100 } } } })
        .mockRejectedValueOnce({ response: { data: { error: { message: 'nope', code: 10 } } } });

      await expect(service.fetchSenderProfile('facebook', integration, 'psid-9')).resolves.toEqual({});
    });
  });
});
