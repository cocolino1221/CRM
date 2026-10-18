import { LandingPagesController } from './landing-pages.controller';

/**
 * `host` arrives as a query parameter the client controls, and when it
 * resolved to nothing the lookup silently dropped the workspace filter. Two
 * consequences the review demonstrated: a submission aimed at another
 * tenant's hostname ran inside that tenant's workspace — creating a contact,
 * enrolling it in their funnel and sending a WhatsApp message on their billed
 * number to an attacker-chosen phone — and a page moved to a private custom
 * domain stayed readable and submittable on the platform host.
 */
function build(resolved: string | null) {
  const landingPagesService = {
    getPublicView: jest.fn().mockResolvedValue({ page: {}, form: null }),
    submitPublic: jest.fn().mockResolvedValue({ success: true }),
  };
  const landingDomains = {
    resolveWorkspaceByHost: jest.fn().mockResolvedValue(resolved),
  };
  const controller = new LandingPagesController(
    landingPagesService as any,
    landingDomains as any,
  );
  return { controller, landingPagesService, landingDomains };
}

const req = (headers: Record<string, string> = {}) => ({ headers, cookies: {} }) as any;
const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as any;

describe('which workspace a public request belongs to', () => {
  it('uses the host the proxy reports, not the one the client claims', async () => {
    const { controller, landingDomains } = build('ws-victim');

    await controller.findBySlug(
      'oferta',
      req({ 'x-forwarded-host': 'pagini.real.ro', host: 'api.primafisoft.com' }),
      res(),
      'ua',
      'false',
      'pagini.victim.ro',
    );

    expect(landingDomains.resolveWorkspaceByHost).toHaveBeenCalledWith('pagini.real.ro');
  });

  it('falls back to the Host header when there is no proxy header', async () => {
    const { controller, landingDomains } = build(null);

    await controller.findBySlug('oferta', req({ host: 'pagini.real.ro' }), res(), 'ua', 'false');

    expect(landingDomains.resolveWorkspaceByHost).toHaveBeenCalledWith('pagini.real.ro');
  });

  // The attack: POST .../submit?host=<victim's domain> from anywhere.
  it('ignores a host the submitter supplied', async () => {
    const { controller, landingDomains } = build('ws-victim');

    await controller.submit(
      'oferta',
      { data: {} } as any,
      '1.2.3.4',
      'ua',
      'ref',
      req({ host: 'etcrm.primafisoft.com' }),
      'pagini.victim.ro',
    );

    expect(landingDomains.resolveWorkspaceByHost).toHaveBeenCalledWith('etcrm.primafisoft.com');
  });

  it('passes the resolved workspace down to the submission', async () => {
    const { controller, landingPagesService } = build('ws-real');

    await controller.submit(
      'oferta',
      { data: {} } as any,
      '1.2.3.4',
      'ua',
      'ref',
      req({ host: 'pagini.real.ro' }),
    );

    const [, , metadata] = landingPagesService.submitPublic.mock.calls[0];
    expect(metadata.workspaceId).toBe('ws-real');
  });
});
