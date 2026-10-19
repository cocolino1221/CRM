import { WorkQueuesService } from './work-queues.service';

/**
 * The Win tab's arithmetic.
 *
 * Payflow confirms one instalment at a time and never sends the contract
 * total, so "1000 EUR, 400 paid, 600 left" can only come from combining the
 * two: the deal the closer raised carries the total, the payflow-stamped
 * deals carry what actually cleared. Get the combination wrong and the tab
 * reports a 1000 EUR plan as a 400 EUR sale, or shows a negative remainder.
 */

const WORKSPACE = 'workspace-1';

function build(dealRows: any[]) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(dealRows),
  };
  const repo = { createQueryBuilder: jest.fn(() => builder) };
  const service = new WorkQueuesService({} as any, {} as any, {} as any, repo as any, {} as any);
  return { service, builder };
}

describe('WorkQueuesService.attachPaymentSummaries', () => {
  it('splits an instalment sale into total, paid and remaining', async () => {
    const { service } = build([
      { contactid: 'c1', paid: '400', contracted: '1000', ininstalments: true, currency: 'EUR' },
    ]);

    const [row]: any = await service.attachPaymentSummaries(WORKSPACE, [{ id: 'c1' }] as any);

    expect(row.payment).toEqual({
      currency: 'EUR',
      total: 1000,
      paid: 400,
      remaining: 600,
      inInstalments: true,
    });
  });

  // Postgres hands numeric columns back as strings; Number() on them is the
  // whole reason this is not just a subtraction.
  it('reads the amounts as numbers, not strings', async () => {
    const { service } = build([
      { contactid: 'c1', paid: '400', contracted: '1000', ininstalments: false, currency: 'EUR' },
    ]);

    const [row]: any = await service.attachPaymentSummaries(WORKSPACE, [{ id: 'c1' }] as any);

    expect(row.payment.remaining).toBe(600);
    expect(typeof row.payment.paid).toBe('number');
  });

  it('treats a sale with no CRM deal as paid in full', async () => {
    const { service } = build([
      { contactid: 'c1', paid: '250', contracted: '0', ininstalments: false, currency: 'EUR' },
    ]);

    const [row]: any = await service.attachPaymentSummaries(WORKSPACE, [{ id: 'c1' }] as any);

    expect(row.payment.total).toBe(250);
    expect(row.payment.remaining).toBe(0);
  });

  // Someone pays more than the deal says — a correction, a second product.
  // Showing "rest -200" would make the tab look broken.
  it('never reports a negative remainder', async () => {
    const { service } = build([
      { contactid: 'c1', paid: '1200', contracted: '1000', ininstalments: true, currency: 'EUR' },
    ]);

    const [row]: any = await service.attachPaymentSummaries(WORKSPACE, [{ id: 'c1' }] as any);

    expect(row.payment.total).toBe(1200);
    expect(row.payment.remaining).toBe(0);
  });

  it('leaves a contact with no deals at all without a payment block', async () => {
    const { service } = build([]);

    const [row]: any = await service.attachPaymentSummaries(WORKSPACE, [{ id: 'c1' }] as any);

    expect(row.payment).toBeUndefined();
  });

  it('asks the database for nothing when there are no rows', async () => {
    const { service, builder } = build([]);

    await expect(service.attachPaymentSummaries(WORKSPACE, [])).resolves.toEqual([]);
    expect(builder.getRawMany).not.toHaveBeenCalled();
  });
});

describe('WorkQueuesService.findClosed', () => {
  function closedBuild(rows: any[]) {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
    };
    const repo = { createQueryBuilder: jest.fn(() => builder) };
    const service = new WorkQueuesService({} as any, {} as any, repo as any, {} as any, {} as any);
    return { service, builder };
  }

  // The flag, not the stage name: a workspace that renamed "Closed Won" to
  // "Client" must still land in the Win tab — and a sale recorded from a call,
  // which writes a closed-won deal without moving the stage, must too.
  it('selects won rows by the stage flag or a closed-won deal', async () => {
    const { service, builder } = closedBuild([]);

    await service.findClosed(WORKSPACE, true);

    const where = builder.andWhere.mock.calls.map((c: any[]) => c[0]).join(' ');
    expect(where).toContain('"pipelineStage"."isClosedWon" = true');
    expect(where).toContain("d.stage = 'closed_won'");
  });

  it('selects lost rows by the opposite flag or a failed last call, never a won one', async () => {
    const { service, builder } = closedBuild([]);

    await service.findClosed(WORKSPACE, false);

    const where = builder.andWhere.mock.calls.map((c: any[]) => c[0]).join(' ');
    expect(where).toContain('"pipelineStage"."isClosedLost" = true');
    expect(where).toContain("= 'failed'");
    expect(where).toContain('AND NOT');
  });
});
