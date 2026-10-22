/**
 * Where tapping a notification takes you — the same answer for a push on the
 * lock screen and for a row in the Notifications list. Kept free of React
 * Navigation so every kind of notification can be tested.
 */

export type NotificationRoute =
  | { kind: 'chat'; waId: string }
  | { kind: 'whatsapp' }
  | { kind: 'social'; channel?: 'instagram' | 'messenger' }
  | { kind: 'booking'; bookingId: string }
  | { kind: 'lead'; contactId: string }
  | { kind: 'leads' }
  | { kind: 'payments' }
  | { kind: 'documents' }
  | { kind: 'calendar' };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/**
 * From what a notification carries: its link ("/leads/<id>", "/whatsapp",
 * "/calendar"…), its type, and the ids in its metadata (a push puts them at
 * the top level of `data`, the list keeps them under `metadata`).
 */
export function notificationRoute(n: {
  type?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}): NotificationRoute | null {
  const meta = { ...(n.metadata ?? {}), ...n } as Record<string, unknown>;
  const link = text(n.link);
  const type = text(n.type).toLowerCase();
  const category = text(meta.category).toLowerCase();
  const waId = text(meta.waId).replace(/\D/g, '');
  const bookingId = text(meta.bookingId);
  const linkId = link.match(UUID)?.[0] ?? '';
  const contactId = text(meta.contactId) || (/^\/(leads|contacts)\//.test(link) ? linkId : '');

  // A booking first: "Lead programat" also names a lead, but the meeting is the news.
  if (bookingId && (type === 'meeting' || link.startsWith('/calendar') || category.startsWith('booking'))) {
    return { kind: 'booking', bookingId };
  }
  if (link.startsWith('/whatsapp') || category === 'message:whatsapp') {
    return waId ? { kind: 'chat', waId } : { kind: 'whatsapp' };
  }
  if (category === 'message:instagram' || text(meta.channel) === 'instagram') return { kind: 'social', channel: 'instagram' };
  if (category === 'message:facebook' || text(meta.channel) === 'messenger') return { kind: 'social', channel: 'messenger' };
  if (contactId) return { kind: 'lead', contactId };
  if (link.startsWith('/payments') || category.startsWith('payment')) return { kind: 'payments' };
  if (link.startsWith('/documents')) return { kind: 'documents' };
  if (link.startsWith('/calendar') || type === 'meeting' || type === 'task') return { kind: 'calendar' };
  if (link.startsWith('/leads') || link.startsWith('/contacts') || type === 'lead') return { kind: 'leads' };
  return null;
}

/** The navigate() arguments for a route, from the root tab navigator. */
export function navigationFor(route: NotificationRoute): [string, Record<string, unknown>?] {
  switch (route.kind) {
    case 'chat': {
      const phone = `+${route.waId}`;
      return ['Messages', { screen: 'Chat', initial: false, params: { waId: route.waId, contactName: phone, phone } }];
    }
    case 'whatsapp':
      return ['Messages', { screen: 'WhatsAppInbox', initial: false }];
    case 'social':
      return ['Messages', { screen: 'SocialInbox', initial: false, params: route.channel ? { initialChannel: route.channel } : undefined }];
    case 'booking':
      return ['Workspace', { screen: 'Calendar', initial: false, params: { focusBookingId: route.bookingId } }];
    case 'lead':
      return ['Leads', { screen: 'LeadDetail', initial: false, params: { contactId: route.contactId } }];
    case 'payments':
      return ['Workspace', { screen: 'Payments', initial: false }];
    case 'documents':
      return ['Workspace', { screen: 'Documents', initial: false }];
    case 'calendar':
      return ['Workspace', { screen: 'Calendar', initial: false }];
    case 'leads':
      return ['Leads'];
  }
}
