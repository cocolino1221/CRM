import { NotFoundException } from '@nestjs/common';
import { LandingPagesController } from './landing-pages.controller';

/**
 * The endpoint Caddy's on-demand TLS calls before issuing a certificate.
 * It decides, for a stranger's hostname, whether this server will answer for
 * it — so it is unauthenticated, must be fast, and must say nothing beyond
 * yes or no.
 */
function build(resolve: (host: string) => Promise<string | null>) {
  const landingDomains: any = { resolveWorkspaceByHost: jest.fn(resolve) };
  const controller = new LandingPagesController({} as any, landingDomains);
  return { controller, landingDomains };
}

describe('GET domains/check — the certificate gate', () => {
  it('allows a hostname a workspace has verified', async () => {
    const { controller } = build(async () => 'ws-1');

    await expect(controller.checkDomain('pagini.salax.ro')).resolves.toEqual({ ok: true });
  });

  // Caddy reads a non-2xx as "do not issue". Anything else would let a
  // stranger make this server request certificates for domains it does not
  // serve, which is how you get rate-limited by Let's Encrypt.
  it('refuses an unknown hostname', async () => {
    const { controller } = build(async () => null);

    await expect(controller.checkDomain('altceva.ro')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses when no hostname is given at all', async () => {
    const { controller } = build(async () => null);

    await expect(controller.checkDomain(undefined as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('never reveals which workspace owns the domain', async () => {
    const { controller } = build(async () => 'ws-secret');

    const result = await controller.checkDomain('pagini.salax.ro');

    expect(JSON.stringify(result)).not.toContain('ws-secret');
  });

  it('asks the resolver with exactly what it was given', async () => {
    const { controller, landingDomains } = build(async () => 'ws-1');

    await controller.checkDomain('Pagini.SalaX.RO');

    expect(landingDomains.resolveWorkspaceByHost).toHaveBeenCalledWith('Pagini.SalaX.RO');
  });
});
