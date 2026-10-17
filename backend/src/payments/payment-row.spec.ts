import {
  fromPayflowDeal,
  fromPayfunnelDocument,
  mergePayments,
  summarize,
} from './payment-row';

const deal = (over: any = {}) => ({
  id: 'deal-1',
  title: 'Abonament 3 luni',
  value: '499.00',
  currency: 'RON',
  stage: 'closed_won',
  actualCloseDate: new Date('2026-10-10T09:00:00Z'),
  createdAt: new Date('2026-10-10T08:00:00Z'),
  customFields: { payflowTransactionId: 'tx-1', source: 'payflow' },
  contact: { id: 'c-1', firstName: 'Ionela', lastName: 'Pop', email: 'i@p.ro' },
  ...over,
});

const doc = (over: any = {}) => ({
  documentId: 'doc-1',
  documentName: 'Contract',
  documentStatus: 'signed',
  createdAt: '2026-10-11T09:00:00Z',
  contact: { id: 'c-2', name: 'Mihai D.', email: 'm@d.ro' },
  payment: { status: 'paid', amount: 300, currency: 'RON', paidAt: '2026-10-11T10:00:00Z', paymentReference: 'pf-9' },
  ...over,
});

describe('fromPayflowDeal', () => {
  it('reads the amount, which the database hands back as a string', () => {
    const row = fromPayflowDeal(deal());

    expect(row.amount).toBe(499);
    expect(row.currency).toBe('RON');
  });

  it('calls a won deal paid and a lost one failed', () => {
    expect(fromPayflowDeal(deal()).status).toBe('paid');
    expect(fromPayflowDeal(deal({ stage: 'closed_lost' })).status).toBe('failed');
  });

  it('carries the transaction reference, which is how a duplicate is spotted', () => {
    expect(fromPayflowDeal(deal()).reference).toBe('tx-1');
  });

  it('dates the payment when it closed, not when the row was written', () => {
    expect(fromPayflowDeal(deal()).occurredAt).toBe('2026-10-10T09:00:00.000Z');
  });

  it('falls back to the creation date when nothing closed it', () => {
    const row = fromPayflowDeal(deal({ actualCloseDate: null }));

    expect(row.occurredAt).toBe('2026-10-10T08:00:00.000Z');
  });

  it('names the contact as one string', () => {
    expect(fromPayflowDeal(deal()).contact?.name).toBe('Ionela Pop');
  });

  it('says where it came from', () => {
    expect(fromPayflowDeal(deal()).source).toBe('payflow');
  });

  it('survives a deal with almost nothing on it', () => {
    const row = fromPayflowDeal({ id: 'd', createdAt: new Date('2026-01-01') } as any);

    expect(row.id).toBeTruthy();
    expect(row.amount).toBeUndefined();
  });
});

describe('fromPayfunnelDocument', () => {
  it('keeps the document it belongs to', () => {
    const row = fromPayfunnelDocument(doc());

    expect(row.document?.id).toBe('doc-1');
    expect(row.document?.name).toBe('Contract');
    expect(row.source).toBe('payfunnel');
  });

  it('dates it when it was paid rather than when the document was made', () => {
    expect(fromPayfunnelDocument(doc()).occurredAt).toBe('2026-10-11T10:00:00.000Z');
  });

  it('falls back to the document date for an unpaid one', () => {
    const row = fromPayfunnelDocument(doc({ payment: { status: 'pending' } }));

    expect(row.occurredAt).toBe('2026-10-11T09:00:00.000Z');
  });
});

describe('mergePayments', () => {
  it('puts the most recent first', () => {
    const rows = mergePayments([fromPayflowDeal(deal())], [fromPayfunnelDocument(doc())]);

    expect(rows.map((r) => r.source)).toEqual(['payfunnel', 'payflow']);
  });

  // The same transaction reaching the CRM twice would count its money twice,
  // which is the one error nobody forgives in a payments screen.
  it('keeps one row when both sources carry the same reference', () => {
    const a = fromPayflowDeal(deal({ customFields: { payflowTransactionId: 'same' } }));
    const b = fromPayfunnelDocument(doc({ payment: { ...doc().payment, paymentReference: 'same' } }));

    const rows = mergePayments([a], [b]);

    expect(rows).toHaveLength(1);
  });

  it('does not merge two rows that merely lack a reference', () => {
    const a = fromPayflowDeal(deal({ customFields: {} }));
    const b = fromPayflowDeal(deal({ id: 'deal-2', customFields: {} }));

    expect(mergePayments([a, b], [])).toHaveLength(2);
  });

  it('copes with either side being empty', () => {
    expect(mergePayments([], [])).toEqual([]);
    expect(mergePayments([fromPayflowDeal(deal())], [])).toHaveLength(1);
  });
});

describe('summarize', () => {
  // Adding 100 EUR to 100 RON and showing 200 is worse than showing nothing.
  it('totals each currency separately', () => {
    const rows = [
      fromPayflowDeal(deal({ value: '100', currency: 'RON' })),
      fromPayflowDeal(deal({ id: 'd2', value: '100', currency: 'EUR', customFields: { payflowTransactionId: 't2' } })),
    ];

    const s = summarize(rows);

    expect(s.paidByCurrency).toEqual({ RON: 100, EUR: 100 });
  });

  it('counts only what was actually paid in the totals', () => {
    const rows = [
      fromPayflowDeal(deal({ value: '100' })),
      fromPayflowDeal(deal({ id: 'd2', value: '50', stage: 'closed_lost', customFields: { payflowTransactionId: 't2' } })),
    ];

    const s = summarize(rows);

    expect(s.paidByCurrency).toEqual({ RON: 100 });
    expect(s.failed).toBe(1);
    expect(s.paid).toBe(1);
  });

  it('reports an empty list as zeroes rather than NaN', () => {
    const s = summarize([]);

    expect(s.paid).toBe(0);
    expect(s.paidByCurrency).toEqual({});
  });
});
