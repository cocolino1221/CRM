import { ZoomIntegrationHandler } from './zoom.handler';

describe('ZoomIntegrationHandler.serverToServer', () => {
  // What the Integrations form actually saves: only the secret is filed as a credential.
  it('reads Account ID and Client ID from config when the form put them there', () => {
    expect(
      ZoomIntegrationHandler.serverToServer({
        credentials: { clientSecret: 's3cret' } as any,
        config: { accountId: 'acc', clientId: 'cli' } as any,
      }),
    ).toEqual({ accountId: 'acc', clientId: 'cli', clientSecret: 's3cret', accessToken: undefined });
  });

  it('prefers credentials over config', () => {
    const r = ZoomIntegrationHandler.serverToServer({
      credentials: { accountId: 'from-creds', clientId: 'c', clientSecret: 's' } as any,
      config: { accountId: 'from-config' } as any,
    });
    expect(r.accountId).toBe('from-creds');
  });

  it('ignores blank values and trims pasted whitespace', () => {
    const r = ZoomIntegrationHandler.serverToServer({
      credentials: { clientSecret: '  s  ' } as any,
      config: { accountId: '   ', clientId: ' cli\n' } as any,
    });
    expect(r).toEqual({ accountId: undefined, clientId: 'cli', clientSecret: 's', accessToken: undefined });
  });
});
