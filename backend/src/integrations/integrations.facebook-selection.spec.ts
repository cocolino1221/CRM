import { IntegrationsService } from './integrations.service';

describe('IntegrationsService Facebook page selection', () => {
  const createService = (claimedPageIds: string[] = []) => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue(
          claimedPageIds.map((pageId) => ({ config: { pageId } })),
        ),
    };
    const deleteSubscription = jest
      .fn()
      .mockResolvedValue({ data: { success: true } });
    const service = Object.create(IntegrationsService.prototype) as any;
    service.integrationRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service.httpService = { axiosRef: { delete: deleteSubscription } };
    service.logger = { log: jest.fn(), warn: jest.fn() };

    return { service, deleteSubscription };
  };

  const pages = [
    { id: 'selected-page', access_token: 'selected-token' },
    { id: 'unused-page', access_token: 'unused-token' },
    { id: 'shared-page', access_token: 'shared-token' },
  ];

  it('unsubscribes a deselected page that no CRM workspace claims', async () => {
    const { service, deleteSubscription } = createService(['shared-page']);

    await service.unsubscribeUnclaimedFacebookPages(pages, ['selected-page']);

    expect(deleteSubscription).toHaveBeenCalledTimes(1);
    expect(deleteSubscription).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/unused-page/subscribed_apps',
      expect.objectContaining({ params: { access_token: 'unused-token' } }),
    );
  });

  it('does not unsubscribe a deselected page claimed by another workspace', async () => {
    const { service, deleteSubscription } = createService([
      'unused-page',
      'shared-page',
    ]);

    await service.unsubscribeUnclaimedFacebookPages(pages, ['selected-page']);

    expect(deleteSubscription).not.toHaveBeenCalled();
  });
});
