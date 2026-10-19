import { WorkQueuesService } from './work-queues.service';

/**
 * The grace period before a fresh lead becomes callable.
 *
 * Someone who has just bought a book is often seconds away from booking a
 * call themselves. Ringing them mid-booking wastes the call and makes the
 * company look like it is watching them type, so each source gets a few
 * minutes of quiet first.
 *
 * Nothing is written to the lead — the queue just does not return it yet.
 * That is deliberate: a stored "to call" flag set at minute ten would be
 * wrong the moment the lead books at minute eleven, and would need a second
 * job to undo it.
 */

const WORKSPACE = 'workspace-1';

function build(settings: any) {
  const builder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getCount: jest.fn().mockResolvedValue(3),
  };
  const contactRepository = { createQueryBuilder: jest.fn(() => builder) };
  const workspaceRepository = { findOne: jest.fn().mockResolvedValue({ settings }) };
  const service = new WorkQueuesService(
    {} as any,
    {} as any,
    contactRepository as any,
    {} as any,
    workspaceRepository as any,
  );
  return { service, builder };
}

describe('WorkQueuesService.graceMinutes', () => {
  it('leaves a book buyer ten minutes to book for themselves', async () => {
    const { service } = build({});

    await expect(service.graceMinutes(WORKSPACE)).resolves.toEqual({
      graceTypeform: 10,
      graceWoocommerce: 10,
      graceManual: 0,
    });
  });

  it('takes the configured wait per source', async () => {
    const { service } = build({ leadGrace: { typeform: 2, woocommerce: 15, manual: 1 } });

    await expect(service.graceMinutes(WORKSPACE)).resolves.toEqual({
      graceTypeform: 2,
      graceWoocommerce: 15,
      graceManual: 1,
    });
  });

  it('accepts zero as "call them straight away"', async () => {
    const { service } = build({ leadGrace: { woocommerce: 0 } });

    await expect(service.graceMinutes(WORKSPACE)).resolves.toMatchObject({
      graceWoocommerce: 0,
    });
  });

  // A negative wait would read as "created in the future" and quietly hide
  // every lead from that source.
  it('falls back to the default on a nonsense value', async () => {
    const { service } = build({ leadGrace: { woocommerce: -5, typeform: 'soon' } });

    await expect(service.graceMinutes(WORKSPACE)).resolves.toMatchObject({
      graceWoocommerce: 10,
      graceTypeform: 10,
    });
  });

  it('survives a workspace row that is missing entirely', async () => {
    const { service } = build(undefined);
    (service as any).workspaceRepository = { findOne: jest.fn().mockResolvedValue(null) };

    await expect(service.graceMinutes(WORKSPACE)).resolves.toMatchObject({
      graceManual: 0,
    });
  });
});

describe('WorkQueuesService.findUnbookedLeads — waiting leads', () => {
  it('reports how many are still inside their grace period', async () => {
    const { service } = build({});

    const result = await service.findUnbookedLeads(WORKSPACE);

    // Hidden from the list, but counted, so nobody thinks a lead went missing.
    expect(result.waiting).toBe(3);
    expect(result.data).toEqual([]);
  });

  it('excludes the waiting ones from the list itself', async () => {
    const { service, builder } = build({});

    await service.findUnbookedLeads(WORKSPACE);

    const clauses = builder.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(clauses.some((c) => c.startsWith('NOT (contact.createdAt >'))).toBe(true);
  });
});
