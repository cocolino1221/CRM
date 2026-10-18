import { IntegrationType } from '../../database/entities/integration.entity';
import { MetaMessagingService } from './meta-messaging.service';

describe('MetaMessagingService shared webhook routing', () => {
  let service: MetaMessagingService;

  beforeEach(() => {
    service = new MetaMessagingService(
      { axiosRef: { get: jest.fn() } } as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const integration = (
    provider: 'facebook' | 'instagram',
    accountId: string,
  ) => ({
    id: `${provider}-integration`,
    workspaceId: 'workspace-1',
    type: IntegrationType.API,
    externalId: provider,
    config: {
      provider,
      ...(provider === 'facebook'
        ? { pageId: accountId }
        : { igUserId: accountId }),
    },
    credentials: { accessToken: 'token' },
  });

  it('routes a Facebook webhook only to the integration with the matching Page ID', () => {
    const selectedPage = integration('facebook', 'selected-page');

    const resolved = (service as any).resolveWebhookIntegration(
      'facebook',
      [selectedPage],
      { id: 'selected-page' },
      { recipient: { id: 'selected-page' } },
    );

    expect(resolved).toBe(selectedPage);
  });

  it('drops a Facebook webhook from an unselected Page even when only one integration exists', () => {
    const selectedPage = integration('facebook', 'selected-page');

    const resolved = (service as any).resolveWebhookIntegration(
      'facebook',
      [selectedPage],
      { id: 'other-business-page' },
      { recipient: { id: 'other-business-page' } },
    );

    expect(resolved).toBeNull();
  });

  it('does not guess an Instagram account when the webhook account ID is unknown', () => {
    const selectedAccount = integration('instagram', 'selected-instagram');

    const resolved = (service as any).resolveWebhookIntegration(
      'instagram',
      [selectedAccount],
      { id: 'other-instagram' },
      { recipient: { id: 'other-instagram' } },
    );

    expect(resolved).toBeNull();
  });
});
