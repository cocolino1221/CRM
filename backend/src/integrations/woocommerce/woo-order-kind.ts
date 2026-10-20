import type { WooLineItem } from './woocommerce.service';

/**
 * What a WooCommerce order means for the pipeline.
 *
 * The workspace marks some products as lead products (the book that brings
 * people in). An order of only those makes a lead to call, as before. An
 * order with anything else in it is a sale: the buyer goes straight to Win,
 * with the amount of what they paid for. With no lead products chosen every
 * order stays a lead — nothing changes until the setting is used.
 */
export interface WooOrderKind {
  kind: 'lead' | 'won';
  /** The non-lead items — what the sale is for. Empty for a lead. */
  paidItems: WooLineItem[];
  /** Their total, or the order total when the items carry none. */
  amount: number;
}

const money = (value: unknown): number => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function classifyWooOrder(
  items: WooLineItem[],
  leadProductIds: unknown,
  orderTotal: unknown,
): WooOrderKind {
  const leadIds = new Set(
    (Array.isArray(leadProductIds) ? leadProductIds : []).map((id) => String(id).trim()).filter(Boolean),
  );
  if (leadIds.size === 0) return { kind: 'lead', paidItems: [], amount: 0 };

  // A variation counts as its parent product, so choosing "Carte" covers every format of it.
  const isLead = (item: WooLineItem) =>
    leadIds.has(item.productId) || (!!item.variationId && leadIds.has(item.variationId));
  const paidItems = items.filter((item) => !isLead(item));
  if (paidItems.length === 0) return { kind: 'lead', paidItems: [], amount: 0 };

  // What the customer paid for them: the line total plus its tax.
  const itemsTotal = paidItems.reduce((sum, item) => sum + money(item.total) + money(item.totalTax), 0);
  const amount = Math.round((itemsTotal > 0 ? itemsTotal : money(orderTotal)) * 100) / 100;
  return { kind: 'won', paidItems, amount };
}
