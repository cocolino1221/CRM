import { describe, expect, it } from 'vitest';
import { unglueBookingLink } from './glued-link';

describe('unglueBookingLink', () => {
  it('pulls the email and phone a Typeform redirect glued onto the slug', () => {
    expect(
      unglueBookingLink('consultatie-h5fxc0cocococo%40c.com%2B40%20712%20345%20635', 'consultatie-h5fxc0', ''),
    ).toBe('/book/consultatie-h5fxc0?email=cocococo%40c.com&phone=%2B40+712+345+635');
  });

  it('copes with the phone first and keeps other query params', () => {
    expect(unglueBookingLink('consultatie-ab12cd0712345635ana@x.ro', 'consultatie-ab12cd', '?v=carte')).toBe(
      '/book/consultatie-ab12cd?v=carte&email=ana%40x.ro&phone=0712345635',
    );
  });

  it('does not overwrite answers the link already carries', () => {
    expect(unglueBookingLink('consultatie-ab12cdx@y.ro', 'consultatie-ab12cd', '?email=real%40z.ro')).toBe(
      '/book/consultatie-ab12cd?email=real%40z.ro',
    );
  });

  it('leaves a normal link alone', () => {
    expect(unglueBookingLink('consultatie-h5fxc0', 'consultatie-h5fxc0', '?email=a%40b.ro')).toBeNull();
    expect(unglueBookingLink('altceva', 'consultatie-h5fxc0', '')).toBeNull();
  });
});
