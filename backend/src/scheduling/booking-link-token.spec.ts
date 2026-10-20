import { createBookingLinkToken, readBookingLinkToken, submittedOnly, withBookingLinkToken } from './booking-link-token';

const SECRET = 'test-secret-that-is-long-enough-123456';
const ANA = { name: 'Ana Pop', email: 'ana@x.ro', phone: '0740111222' };

describe('booking link token', () => {
  it('carries what was typed, for one workspace', () => {
    const token = createBookingLinkToken(ANA, 'w-1', SECRET);
    expect(readBookingLinkToken(token, SECRET)).toEqual({ workspaceId: 'w-1', prefill: ANA });
  });

  it('is not readable in the URL', () => {
    const token = createBookingLinkToken(ANA, 'w-1', SECRET);
    expect(Buffer.from(token.replace(/\./g, ''), 'base64url').toString('latin1')).not.toContain('ana@x.ro');
  });

  it('refuses a tampered token, a wrong secret and an expired one', () => {
    const [iv, body, tag] = createBookingLinkToken(ANA, 'w-1', SECRET).split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    expect(readBookingLinkToken(`${iv}.${flipped.toString('base64url')}.${tag}`, SECRET)).toBeNull();
    expect(readBookingLinkToken(`${iv}.${body}.${tag}`, 'other-secret')).toBeNull();
    expect(readBookingLinkToken(createBookingLinkToken(ANA, 'w-1', SECRET, 0), SECRET)).toBeNull();
    expect(readBookingLinkToken('garbage', SECRET)).toBeNull();
  });

  it('is added only to links that go to this CRM\'s booking page', () => {
    const crm = 'https://etcrm.primafisoft.com';
    expect(withBookingLinkToken(`${crm}/book/c-1?a=1`, 'T', crm)).toBe(`${crm}/book/c-1?a=1&t=T`);
    expect(withBookingLinkToken(`${crm}/multumim`, 'T', crm)).toBe(`${crm}/multumim`);
    // A third-party site that merely has a /book/ path never gets the pass.
    expect(withBookingLinkToken('https://evil.example/book/c-1', 'T', crm)).toBe('https://evil.example/book/c-1');
    expect(withBookingLinkToken(`${crm}/book/c-1`, 'T', undefined)).toBe(`${crm}/book/c-1`);
  });
});

describe('submittedOnly', () => {
  const contact = { firstName: 'Ana', lastName: 'Pop', email: 'ana@x.ro', phone: '+40740111222' };

  it('returns what the visitor typed', () => {
    expect(submittedOnly(contact, { n: 'Ana Pop', e: 'ANA@x.ro', t: '0740 111 222' })).toEqual({
      name: 'Ana Pop',
      email: 'ana@x.ro',
      phone: '+40740111222',
    });
  });

  // Someone typing a stranger's email is matched to that stranger's contact;
  // the pass must not hand them the stranger's name or phone.
  it('does not reveal what the CRM knew but the visitor did not type', () => {
    expect(submittedOnly(contact, { e: 'ana@x.ro' })).toEqual({ name: '', email: 'ana@x.ro', phone: '' });
    expect(submittedOnly(contact, { n: 'Ion', e: 'ana@x.ro', t: '0799999999' })).toEqual({
      name: '',
      email: 'ana@x.ro',
      phone: '',
    });
  });
});
