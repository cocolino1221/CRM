/**
 * Builds the title/message for "new lead" notifications so every sender
 * (ContactsService owner ping, WhatsApp workspace broadcast) names where the
 * lead came from: the Typeform form, or the WooCommerce products ordered.
 */
const MAX_MESSAGE_LENGTH = 240;

function contactDisplayName(contact: any): string {
  const last = contact?.lastName === '-' ? '' : contact?.lastName;
  const name = `${contact?.firstName ?? ''} ${last ?? ''}`.replace(/\s+/g, ' ').trim();
  return name || contact?.phone || contact?.email || 'New lead';
}

function wooProductsText(wooOrder: any): string {
  return (Array.isArray(wooOrder?.lineItems) ? wooOrder.lineItems : [])
    .map((item: any) => {
      const name = String(item?.name || '').trim();
      if (!name) return '';
      return Number(item?.quantity) > 1 ? `${item.quantity}× ${name}` : name;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Sources nobody should be interrupted for. Payflow records a payment for
 * someone the team is already working — the lead itself was announced by
 * whichever source first brought them in, so a second push says nothing new.
 */
const SILENT_SOURCES = new Set(['payflow']);

export function shouldNotifyLeadSource(source?: string | null): boolean {
  return !SILENT_SOURCES.has(String(source || '').toLowerCase());
}

export function buildLeadNotification(
  contact: any,
  options: { returning?: boolean } = {},
): { title: string; message: string } {
  const name = contactDisplayName(contact);
  const source = String(contact?.source || '').toLowerCase();
  const custom = contact?.customFields || {};
  let title = options.returning ? 'Returning lead' : 'New lead';
  let message = `${name} was added${source ? ` via ${source}` : ''}`;

  if (source.includes('woocommerce')) {
    const order = custom.wooOrder;
    const products = wooProductsText(order);
    const orderRef = order?.orderNumber ? ` (order #${order.orderNumber})` : '';
    title = options.returning ? 'New WooCommerce order' : 'New lead from WooCommerce';
    message = `${name} — ordered ${products || 'from WooCommerce'}${orderRef}`;
  } else if (source.includes('typeform')) {
    const formTitle = String(custom.typeformMetadata?.formTitle || '').trim();
    title = options.returning ? 'Returning lead from Typeform' : 'New lead from Typeform';
    message = `${name} — added from Typeform${formTitle ? ` "${formTitle}"` : ''}`;
  }

  if (message.length > MAX_MESSAGE_LENGTH) message = `${message.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
  return { title, message };
}
