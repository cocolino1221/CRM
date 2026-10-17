import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LandingDomainsService } from './landing-domains.service';
import { LandingDomainStatus } from '../database/entities/landing-domain.entity';

const WORKSPACE = 'ws-1';
const OTHER_WORKSPACE = 'ws-2';

function build(existing: any[] = [], dns: any = {}) {
  const rows = [...existing];
  const repository: any = {
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(
        rows.find((r) =>
          Object.entries(where).every(([k, v]) => (r as any)[k] === v),
        ) ?? null,
      ),
    ),
    find: jest.fn(({ where }: any) =>
      Promise.resolve(
        rows.filter((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v)),
      ),
    ),
    create: jest.fn((data: any) => ({ id: `d-${rows.length + 1}`, ...data })),
    save: jest.fn((row: any) => {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows[i] = row;
      else rows.push(row);
      return Promise.resolve(row);
    }),
    softRemove: jest.fn((row: any) => {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows.splice(i, 1);
      return Promise.resolve(row);
    }),
  };

  const resolver = {
    resolveTxt: jest.fn().mockResolvedValue(dns.txt ?? []),
    resolveCname: jest.fn().mockResolvedValue(dns.cname ?? []),
  };

  const service = new LandingDomainsService(repository, resolver as any);
  return { service, repository, resolver, rows };
}

const pendingRow = (over: any = {}) => ({
  id: 'd-1',
  workspaceId: WORKSPACE,
  hostname: 'pagini.salax.ro',
  status: LandingDomainStatus.PENDING,
  verificationToken: 'etcrm-verify=tok-abc',
  isPrimary: false,
  ...over,
});

describe('LandingDomainsService.addDomain', () => {
  it('stores the normalized hostname, whatever was pasted', async () => {
    const { service } = build();

    const row = await service.addDomain(WORKSPACE, ' HTTPS://Pagini.SalaX.ro/oferta ');

    expect(row.hostname).toBe('pagini.salax.ro');
    expect(row.workspaceId).toBe(WORKSPACE);
    expect(row.status).toBe(LandingDomainStatus.PENDING);
  });

  it('issues a verification token nobody can guess', async () => {
    const { service } = build();

    const a = await service.addDomain(WORKSPACE, 'a.salax.ro');
    const b = await service.addDomain(WORKSPACE, 'b.salax.ro');

    expect(a.verificationToken).toMatch(/^etcrm-verify=[a-z0-9]{24,}$/);
    expect(a.verificationToken).not.toBe(b.verificationToken);
  });

  // Whoever verifies a hostname first holds it. Letting a second workspace
  // claim it would make a live domain resolve to two tenants.
  it('refuses a hostname another workspace already holds', async () => {
    const { service } = build([pendingRow({ workspaceId: OTHER_WORKSPACE })]);

    await expect(service.addDomain(WORKSPACE, 'pagini.salax.ro')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a hostname this workspace already added', async () => {
    const { service } = build([pendingRow()]);

    await expect(service.addDomain(WORKSPACE, 'pagini.salax.ro')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses the platform\'s own domain', async () => {
    const { service } = build();

    await expect(service.addDomain(WORKSPACE, 'etcrm.primafisoft.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses nonsense', async () => {
    const { service } = build();

    await expect(service.addDomain(WORKSPACE, 'not a domain')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('makes the first domain of a workspace its primary one', async () => {
    const { service } = build();

    const first = await service.addDomain(WORKSPACE, 'a.salax.ro');
    expect(first.isPrimary).toBe(true);

    const second = await service.addDomain(WORKSPACE, 'b.salax.ro');
    expect(second.isPrimary).toBe(false);
  });
});

describe('LandingDomainsService.verify', () => {
  it('activates a domain whose TXT record carries the token', async () => {
    const { service } = build([pendingRow()], { txt: [['etcrm-verify=tok-abc']] });

    const row = await service.verify(WORKSPACE, 'd-1');

    expect(row.status).toBe(LandingDomainStatus.ACTIVE);
    expect(row.verifiedAt).toBeInstanceOf(Date);
    expect(row.lastError).toBeNull();
  });

  it('looks the token up on the right name', async () => {
    const { service, resolver } = build([pendingRow()], { txt: [['etcrm-verify=tok-abc']] });

    await service.verify(WORKSPACE, 'd-1');

    expect(resolver.resolveTxt).toHaveBeenCalledWith('_etcrm-verify.pagini.salax.ro');
  });

  // DNS returns TXT values as arrays of chunks; a long value arrives split.
  it('joins the chunks DNS splits a long TXT value into', async () => {
    const { service } = build([pendingRow({ verificationToken: 'etcrm-verify=abcdef' })], {
      txt: [['etcrm-verify=', 'abcdef']],
    });

    const row = await service.verify(WORKSPACE, 'd-1');

    expect(row.status).toBe(LandingDomainStatus.ACTIVE);
  });

  it('finds the token among other TXT records on the same name', async () => {
    const { service } = build([pendingRow()], {
      txt: [['v=spf1 include:_spf.google.com ~all'], ['etcrm-verify=tok-abc']],
    });

    await expect(service.verify(WORKSPACE, 'd-1')).resolves.toMatchObject({
      status: LandingDomainStatus.ACTIVE,
    });
  });

  it('fails with a message the customer can act on when the record is missing', async () => {
    const { service } = build([pendingRow()], { txt: [] });

    const row = await service.verify(WORKSPACE, 'd-1');

    expect(row.status).toBe(LandingDomainStatus.FAILED);
    expect(row.lastError).toMatch(/TXT/i);
    expect(row.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('fails when the record exists but carries someone else\'s token', async () => {
    const { service } = build([pendingRow()], { txt: [['etcrm-verify=other-token']] });

    const row = await service.verify(WORKSPACE, 'd-1');

    expect(row.status).toBe(LandingDomainStatus.FAILED);
  });

  // A domain with no record at all makes the resolver throw ENOTFOUND rather
  // than return an empty list.
  it('treats a DNS lookup failure as "not yet", not as a crash', async () => {
    const { service, resolver } = build([pendingRow()]);
    resolver.resolveTxt.mockRejectedValue(Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' }));

    const row = await service.verify(WORKSPACE, 'd-1');

    expect(row.status).toBe(LandingDomainStatus.FAILED);
    expect(row.lastError).toBeTruthy();
  });

  it('refuses to verify a domain belonging to another workspace', async () => {
    const { service } = build([pendingRow({ workspaceId: OTHER_WORKSPACE })]);

    await expect(service.verify(WORKSPACE, 'd-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LandingDomainsService.resolveWorkspaceByHost', () => {
  it('finds the workspace that owns an active hostname', async () => {
    const { service } = build([pendingRow({ status: LandingDomainStatus.ACTIVE })]);

    await expect(service.resolveWorkspaceByHost('pagini.salax.ro')).resolves.toBe(WORKSPACE);
  });

  it('matches whatever case and form the Host header arrives in', async () => {
    const { service } = build([pendingRow({ status: LandingDomainStatus.ACTIVE })]);

    await expect(service.resolveWorkspaceByHost('Pagini.SalaX.RO:443')).resolves.toBe(WORKSPACE);
  });

  // An unverified domain must not serve anything: until the TXT record proves
  // ownership, the person who typed it may not own it.
  it('ignores a domain that is not verified yet', async () => {
    const { service } = build([pendingRow()]);

    await expect(service.resolveWorkspaceByHost('pagini.salax.ro')).resolves.toBeNull();
  });

  it('returns null for an unknown host', async () => {
    const { service } = build([]);

    await expect(service.resolveWorkspaceByHost('altceva.ro')).resolves.toBeNull();
    await expect(service.resolveWorkspaceByHost('')).resolves.toBeNull();
  });
});
