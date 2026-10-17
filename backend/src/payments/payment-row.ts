/**
 * One shape for money that reached the CRM, whatever brought it.
 *
 * Two sources exist and neither knew about the other. PayFunnels payments
 * live as metadata on a signed document, inside a 7,000-line documents
 * service. Payflow transactions arrive through its own sync and land as
 * closed deals, which is why they never appeared on the payments screen at
 * all.
 *
 * These functions are pure so the two conversions and the merge can be
 * tested without either of those subsystems.
 */

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'unknown';
export type PaymentSource = 'payfunnel' | 'payflow';

export interface PaymentRow {
  id: string;
  source: PaymentSource;
  status: PaymentStatus;
  amount?: number;
  currency?: string;
  /** When the money moved — not when the row was written. */
  occurredAt: string;
  /** The provider's transaction id, and how a duplicate is recognised. */
  reference?: string;
  title?: string;
  contact?: { id?: string; name?: string; email?: string };
  deal?: { id: string; title?: string; stage?: string };
  /** Only PayFunnels payments belong to a document. */
  document?: { id: string; name?: string; status?: string };
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Postgres hands numeric columns back as strings. */
function toAmount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function fromPayflowDeal(deal: any): PaymentRow {
  const won = String(deal?.stage || '').toLowerCase() === 'closed_won';
  const lost = String(deal?.stage || '').toLowerCase() === 'closed_lost';
  const contact = deal?.contact;
  const name = contact
    ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || contact.email || undefined
    : undefined;

  return {
    id: `payflow:${deal?.id}`,
    source: 'payflow',
    status: won ? 'paid' : lost ? 'failed' : 'pending',
    amount: toAmount(deal?.value),
    currency: deal?.currency || undefined,
    occurredAt: toIso(deal?.actualCloseDate) || toIso(deal?.createdAt) || new Date(0).toISOString(),
    reference: deal?.customFields?.payflowTransactionId || undefined,
    title: deal?.title || undefined,
    contact: contact ? { id: contact.id, name, email: contact.email } : undefined,
    deal: deal?.id ? { id: deal.id, title: deal.title, stage: deal.stage } : undefined,
  };
}

export function fromPayfunnelDocument(item: any): PaymentRow {
  const payment = item?.payment ?? {};

  return {
    id: `payfunnel:${item?.documentId}`,
    source: 'payfunnel',
    status: (payment.status as PaymentStatus) || 'unknown',
    amount: toAmount(payment.amount),
    currency: payment.currency || undefined,
    occurredAt:
      toIso(payment.paidAt) ||
      toIso(payment.failedAt) ||
      toIso(item?.signedAt) ||
      toIso(item?.createdAt) ||
      new Date(0).toISOString(),
    reference: payment.paymentReference || undefined,
    title: item?.documentName || undefined,
    contact: item?.contact,
    deal: item?.deal,
    document: item?.documentId
      ? { id: item.documentId, name: item.documentName, status: item.documentStatus }
      : undefined,
  };
}

/**
 * Newest first, and one row per transaction.
 *
 * A payment that reached the CRM through both providers would otherwise have
 * its money counted twice, which is the one error a payments screen does not
 * survive. Rows without a reference are never merged: two of them are two
 * payments that happen to be anonymous, not one payment seen twice.
 */
export function mergePayments(a: PaymentRow[], b: PaymentRow[]): PaymentRow[] {
  const byReference = new Map<string, PaymentRow>();
  const unreferenced: PaymentRow[] = [];

  for (const row of [...a, ...b]) {
    if (!row.reference) {
      unreferenced.push(row);
      continue;
    }
    const existing = byReference.get(row.reference);
    // A document-backed row carries more for a person to look at, so it wins.
    if (!existing || (existing.source === 'payflow' && row.source === 'payfunnel')) {
      byReference.set(row.reference, row);
    }
  }

  return [...byReference.values(), ...unreferenced].sort((x, y) =>
    y.occurredAt.localeCompare(x.occurredAt),
  );
}

export interface PaymentSummary {
  total: number;
  paid: number;
  pending: number;
  failed: number;
  /**
   * Kept apart on purpose. Adding 100 EUR to 100 RON and showing 200 is
   * worse than showing nothing, because it looks like an answer.
   */
  paidByCurrency: Record<string, number>;
}

export function summarize(rows: PaymentRow[]): PaymentSummary {
  const summary: PaymentSummary = {
    total: rows.length,
    paid: 0,
    pending: 0,
    failed: 0,
    paidByCurrency: {},
  };

  for (const row of rows) {
    if (row.status === 'paid') summary.paid += 1;
    else if (row.status === 'failed') summary.failed += 1;
    else if (row.status === 'pending') summary.pending += 1;

    if (row.status === 'paid' && typeof row.amount === 'number') {
      const currency = row.currency || '—';
      summary.paidByCurrency[currency] = (summary.paidByCurrency[currency] || 0) + row.amount;
    }
  }

  return summary;
}
