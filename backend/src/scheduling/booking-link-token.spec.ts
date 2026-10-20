import { createBookingLinkToken, readBookingLinkToken, withBookingLinkToken } from './booking-link-token';

const SECRET = 'test-secret-that-is-long-enough-123456';

describe('booking link token', () => {
  it('names the contact and workspace it was made for', () => {
    const token = createBookingLinkToken('c-1', 'w-1', SECRET);
    expect(readBookingLinkToken(token, SECRET)).toEqual({ contactId: 'c-1', workspaceId: 'w-1' });
  });

  it('refuses a tampered token, a wrong secret and an expired one', () => {
    const token = createBookingLinkToken('c-1', 'w-1', SECRET, 0);
    const [payload, sig] = createBookingLinkToken('c-1', 'w-1', SECRET).split('.');
    const forged = `${Buffer.from(JSON.stringify({ c: 'c-2', w: 'w-1', e: Date.now() + 1e9 })).toString('base64url')}.${sig}`;
    expect(readBookingLinkToken(forged, SECRET)).toBeNull();
    expect(readBookingLinkToken(`${payload}.${sig}`, 'other-secret')).toBeNull();
    expect(readBookingLinkToken(token, SECRET)).toBeNull();
    expect(readBookingLinkToken('garbage', SECRET)).toBeNull();
  });

  it('is added only to links that go to a booking page', () => {
    expect(withBookingLinkToken('https://x.ro/book/consultatie-1?a=1', 'T')).toBe('https://x.ro/book/consultatie-1?a=1&t=T');
    expect(withBookingLinkToken('https://x.ro/multumim', 'T')).toBe('https://x.ro/multumim');
    expect(withBookingLinkToken(undefined, 'T')).toBeUndefined();
  });
});
