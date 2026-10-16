import { normalizeIdentityEmail } from './email.util';

describe('normalizeIdentityEmail', () => {
  it('lowercases and trims a real address', () => {
    expect(normalizeIdentityEmail('  Ana.Marin@Yahoo.COM ')).toBe('ana.marin@yahoo.com');
  });

  it('returns null for empty or malformed input', () => {
    expect(normalizeIdentityEmail(undefined)).toBeNull();
    expect(normalizeIdentityEmail('')).toBeNull();
    expect(normalizeIdentityEmail('not-an-email')).toBeNull();
    expect(normalizeIdentityEmail('missing@tld')).toBeNull();
  });

  // These are the values that make a naive duplicate check unusable here:
  // 162 contacts in this workspace literally store "{{email}}", and hundreds
  // carry synthetic placeholder domains. Treating them as identities would make
  // every new ManyChat/WhatsApp/Meta contact collide with an existing one.
  it('returns null for an unrendered ManyChat template', () => {
    expect(normalizeIdentityEmail('{{email}}')).toBeNull();
  });

  it('returns null for synthetic placeholder domains', () => {
    expect(normalizeIdentityEmail('40755998877@whatsapp.placeholder.invalid')).toBeNull();
    expect(normalizeIdentityEmail('instagram.123@meta.placeholder.invalid')).toBeNull();
    expect(normalizeIdentityEmail('773314891@sheet.placeholder.invalid')).toBeNull();
  });

  it('returns null for obvious test addresses', () => {
    expect(normalizeIdentityEmail('test@test.test')).toBeNull();
    expect(normalizeIdentityEmail('asd@s.com')).toBeNull();
  });

  it('keeps a real address that merely looks unusual', () => {
    expect(normalizeIdentityEmail('mihaelacelra@yahoo.es')).toBe('mihaelacelra@yahoo.es');
  });
});
