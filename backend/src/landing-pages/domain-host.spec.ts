import { BadRequestException } from '@nestjs/common';
import { normalizeHostname, assertHostnameAllowed, RESERVED_HOSTNAMES } from './domain-host';

describe('normalizeHostname', () => {
  it('lowercases, because DNS does not care but our unique index does', () => {
    expect(normalizeHostname('Pagini.SalaX.RO')).toBe('pagini.salax.ro');
  });

  it('trims whitespace a paste brings along', () => {
    expect(normalizeHostname('  pagini.salax.ro  ')).toBe('pagini.salax.ro');
  });

  // People paste what is in their address bar, not a bare hostname.
  it('strips a protocol', () => {
    expect(normalizeHostname('https://pagini.salax.ro')).toBe('pagini.salax.ro');
    expect(normalizeHostname('http://pagini.salax.ro')).toBe('pagini.salax.ro');
  });

  it('strips a path, query and fragment', () => {
    expect(normalizeHostname('https://pagini.salax.ro/oferta?x=1#top')).toBe('pagini.salax.ro');
    expect(normalizeHostname('pagini.salax.ro/oferta')).toBe('pagini.salax.ro');
  });

  it('strips a port', () => {
    expect(normalizeHostname('pagini.salax.ro:443')).toBe('pagini.salax.ro');
  });

  // A Host header may legally end in a dot; the stored value must not.
  it('strips a trailing dot', () => {
    expect(normalizeHostname('pagini.salax.ro.')).toBe('pagini.salax.ro');
  });

  it('returns null for something that is not a hostname at all', () => {
    for (const bad of ['', '   ', 'not a host', 'http://', '...', 'salax', '-salax.ro', 'salax-.ro']) {
      expect(normalizeHostname(bad)).toBeNull();
    }
  });

  it('returns null rather than throwing on rubbish input', () => {
    expect(normalizeHostname(null as any)).toBeNull();
    expect(normalizeHostname(undefined as any)).toBeNull();
    expect(normalizeHostname(42 as any)).toBeNull();
  });

  it('accepts a plain apex domain and a deep subdomain', () => {
    expect(normalizeHostname('salax.ro')).toBe('salax.ro');
    expect(normalizeHostname('pagini.campanii.salax.ro')).toBe('pagini.campanii.salax.ro');
  });

  it('accepts a hyphenated label and a long TLD', () => {
    expect(normalizeHostname('sala-x.fitness')).toBe('sala-x.fitness');
  });
});

describe('assertHostnameAllowed', () => {
  // The whole platform lives on these. A tenant claiming one would take over
  // the CRM's own traffic, including the login page.
  it('refuses the platform\'s own hostnames', () => {
    for (const host of RESERVED_HOSTNAMES) {
      expect(() => assertHostnameAllowed(host)).toThrow(BadRequestException);
    }
  });

  it('refuses a subdomain of a platform hostname', () => {
    expect(() => assertHostnameAllowed('oricine.etcrm.primafisoft.com')).toThrow(
      BadRequestException,
    );
  });

  it('refuses localhost and bare IP addresses', () => {
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0', '192.168.1.10', '::1']) {
      expect(() => assertHostnameAllowed(host)).toThrow(BadRequestException);
    }
  });

  it('refuses a hostname that will not normalize', () => {
    expect(() => assertHostnameAllowed('not a host')).toThrow(BadRequestException);
  });

  it('allows an ordinary customer domain', () => {
    expect(() => assertHostnameAllowed('pagini.salax.ro')).not.toThrow();
    expect(() => assertHostnameAllowed('salax.ro')).not.toThrow();
  });

  it('returns the normalized form it approved', () => {
    expect(assertHostnameAllowed(' HTTPS://Pagini.SalaX.ro/ ')).toBe('pagini.salax.ro');
  });
});
