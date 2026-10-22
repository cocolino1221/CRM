import { describe, expect, it } from 'vitest';
import { navigationFor, notificationRoute } from './notification-route';

const LEAD = '868b595a-f375-42c6-9567-771203b884f2';
const BOOKING = 'f57104f8-c0d0-4e67-a46d-2362f5247db6';

describe('notificationRoute', () => {
  it('opens the lead a new-lead notification names', () => {
    expect(notificationRoute({ type: 'lead', link: `/leads/${LEAD}`, metadata: { category: 'lead:manual' } })).toEqual({
      kind: 'lead',
      contactId: LEAD,
    });
    expect(notificationRoute({ type: 'lead', link: '/contacts', metadata: { contactId: LEAD } })).toEqual({ kind: 'lead', contactId: LEAD });
  });

  it('opens the booking, not just the lead, for a meeting', () => {
    expect(
      notificationRoute({ type: 'meeting', link: `/leads/${LEAD}`, metadata: { bookingId: BOOKING, contactId: LEAD } }),
    ).toEqual({ kind: 'booking', bookingId: BOOKING });
    expect(notificationRoute({ type: 'meeting', link: '/calendar', metadata: { bookingId: BOOKING, contactId: null } })).toEqual({
      kind: 'booking',
      bookingId: BOOKING,
    });
  });

  it('opens the WhatsApp chat, or the inbox without a number', () => {
    expect(notificationRoute({ type: 'whatsapp', link: '/whatsapp', metadata: { waId: '40721171918', contactId: LEAD } })).toEqual({
      kind: 'chat',
      waId: '40721171918',
    });
    expect(notificationRoute({ type: 'whatsapp', link: '/whatsapp' })).toEqual({ kind: 'whatsapp' });
  });

  it('sends Instagram and Messenger to the social inbox', () => {
    expect(notificationRoute({ type: 'whatsapp', link: null, metadata: { category: 'message:instagram', contactId: LEAD } })).toEqual({
      kind: 'social',
      channel: 'instagram',
    });
    expect(notificationRoute({ type: 'whatsapp', metadata: { channel: 'messenger' } })).toEqual({ kind: 'social', channel: 'messenger' });
  });

  it('reads a push, which carries the ids at the top level', () => {
    expect(notificationRoute({ type: 'meeting', link: '/calendar', bookingId: BOOKING, contactId: '' })).toEqual({
      kind: 'booking',
      bookingId: BOOKING,
    });
    expect(notificationRoute({ type: 'lead', link: '/contacts', contactId: LEAD })).toEqual({ kind: 'lead', contactId: LEAD });
  });

  it('sends payments, sheets leads and the rest somewhere sensible', () => {
    expect(notificationRoute({ type: 'system', link: '/payments', metadata: { category: 'payment:received', contactId: null } })).toEqual({
      kind: 'payments',
    });
    expect(notificationRoute({ type: 'lead', link: '/leads', metadata: { category: 'lead:sheets' } })).toEqual({ kind: 'leads' });
    expect(notificationRoute({ type: 'system', link: null })).toBeNull();
  });
});

describe('navigationFor', () => {
  it('keeps the tab menu under the screen it opens', () => {
    expect(navigationFor({ kind: 'lead', contactId: LEAD })).toEqual([
      'Leads',
      { screen: 'LeadDetail', initial: false, params: { contactId: LEAD } },
    ]);
    expect(navigationFor({ kind: 'booking', bookingId: BOOKING })[1]).toMatchObject({
      screen: 'Calendar',
      params: { focusBookingId: BOOKING },
    });
  });
});
