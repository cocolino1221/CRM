import { describe, expect, it } from 'vitest';
import { describeDomain, nextActionFor } from './domain-status';

const base = {
  id: 'd-1',
  hostname: 'pagini.salax.ro',
  status: 'pending' as const,
  verificationToken: 'etcrm-verify=abc',
  isPrimary: false,
  dns: {
    verification: { type: 'TXT', name: '_etcrm-verify.pagini.salax.ro', value: 'etcrm-verify=abc' },
    pointing: { type: 'CNAME', name: 'pagini.salax.ro', value: 'etcrm.primafisoft.com' },
  },
};

describe('describeDomain', () => {
  it('tells a waiting customer what is happening, not just a status word', () => {
    const d = describeDomain(base);

    expect(d.tone).toBe('waiting');
    expect(d.label).toBeTruthy();
    expect(d.label).not.toBe('pending');
  });

  it('says a verified domain is live', () => {
    const d = describeDomain({ ...base, status: 'active', verifiedAt: '2026-10-17T10:00:00Z' });

    expect(d.tone).toBe('live');
  });

  // The failure a customer sees most often is "DNS has not propagated yet",
  // which is not a failure at all. Showing the server's own sentence beats
  // inventing a generic one.
  it('repeats the reason the server gave for a failure', () => {
    const d = describeDomain({
      ...base,
      status: 'failed',
      lastError: 'Nu există nicio înregistrare TXT pe _etcrm-verify.pagini.salax.ro.',
    });

    expect(d.tone).toBe('problem');
    expect(d.detail).toContain('TXT');
  });

  it('still says something when a failure carries no reason', () => {
    const d = describeDomain({ ...base, status: 'failed' });

    expect(d.tone).toBe('problem');
    expect(d.detail.length).toBeGreaterThan(0);
  });

  it('marks the primary domain', () => {
    expect(describeDomain({ ...base, isPrimary: true }).isPrimary).toBe(true);
  });

  it('survives a row with a status it has never heard of', () => {
    const d = describeDomain({ ...base, status: 'teleporting' as any });

    expect(d.tone).toBe('waiting');
    expect(d.label).toBeTruthy();
  });
});

describe('nextActionFor', () => {
  it('asks an unverified domain to be checked', () => {
    expect(nextActionFor(base)).toBe('verify');
  });

  it('asks a failed domain to be checked again', () => {
    expect(nextActionFor({ ...base, status: 'failed' })).toBe('verify');
  });

  // Re-checking a live domain would only risk turning it off.
  it('leaves a live domain alone', () => {
    expect(nextActionFor({ ...base, status: 'active' })).toBe('none');
  });
});
