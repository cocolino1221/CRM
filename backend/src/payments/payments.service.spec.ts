import { PaymentsService } from './payments.service';

/**
 * The review found the unified payments screen showing only half the money:
 * DocumentsService.findPayments() answers with `{ payments }`, and this
 * service read `result.data`. Every PayFunnels payment was dropped, and the
 * catch around it meant nobody ever saw an error.
 */
function build(payfunnelRows: any[], payflowDeals: any[]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(payflowDeals),
  };
  const dealRepository = { createQueryBuilder: jest.fn(() => qb) };
  const documentsService = {
    findPayments: jest.fn().mockResolvedValue({
      payments: payfunnelRows,
      total: payfunnelRows.length,
      summary: {},
    }),
  };

  return {
    service: new PaymentsService(dealRepository as any, documentsService as any),
    qb,
  };
}

const payfunnelRow = (over: any = {}) => ({
  documentId: 'doc-1',
  documentName: 'Contract',
  createdAt: '2026-10-11T09:00:00Z',
  payment: { status: 'paid', amount: 300, currency: 'RON', paidAt: '2026-10-11T10:00:00Z' },
  ...over,
});

const payflowDeal = (over: any = {}) => ({
  id: 'deal-1',
  title: 'Abonament',
  value: '499.00',
  currency: 'RON',
  stage: 'closed_won',
  actualCloseDate: new Date('2026-10-10T09:00:00Z'),
  createdAt: new Date('2026-10-10T08:00:00Z'),
  customFields: { payflowTransactionId: 'tx-1', source: 'payflow' },
  ...over,
});

describe('PaymentsService.findAll', () => {
  it('returns the payments from both providers', async () => {
    const { service } = build([payfunnelRow()], [payflowDeal()]);

    const { data } = await service.findAll('ws-1');

    expect(data.map((r) => r.source).sort()).toEqual(['payflow', 'payfunnel']);
  });

  // The defect: PayFunnels money was absent from every total.
  it('counts the PayFunnels money in the summary', async () => {
    const { service } = build([payfunnelRow()], [payflowDeal()]);

    const { summary } = await service.findAll('ws-1');

    expect(summary.paid).toBe(2);
    expect(summary.paidByCurrency).toEqual({ RON: 799 });
  });

  it('still works when one provider has nothing', async () => {
    const { service } = build([], [payflowDeal()]);

    const { data } = await service.findAll('ws-1');

    expect(data).toHaveLength(1);
  });

  // A deal that is not closed has no actualCloseDate, and Postgres sorts
  // NULLS FIRST on DESC — so a page of pending deals could push every paid
  // one past the limit and report zero income.
  it('does not let undated pending deals crowd out the paid ones', async () => {
    const { service, qb } = build([], []);
    await service.findAll('ws-1');

    const ordering = qb.orderBy.mock.calls.concat(qb.addOrderBy.mock.calls).flat().join(' ');

    expect(ordering.toUpperCase()).toContain('NULLS LAST');
  });
});
