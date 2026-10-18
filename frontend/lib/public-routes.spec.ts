import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-routes';

describe('isPublicPath', () => {
  // The bug this file exists for: every landing page under /p/ was behind the
  // auth guard, so an anonymous visitor arriving from an ad was redirected to
  // a login screen. A paid click reaching a login form is money set on fire.
  it('lets anyone open a landing page', () => {
    expect(isPublicPath('/p/consultatie-gratuita')).toBe(true);
    expect(isPublicPath('/p/orice-slug')).toBe(true);
  });

  it('lets anyone open a public form', () => {
    expect(isPublicPath('/forms/public/abc123')).toBe(true);
  });

  it('keeps the sign-in pages public', () => {
    for (const p of ['/login', '/register', '/forgot-password', '/reset-password']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it('keeps the OAuth callback public, so tokens can still be exchanged', () => {
    expect(isPublicPath('/auth/callback')).toBe(true);
  });

  it('keeps the legal pages public', () => {
    for (const p of ['/privacy', '/terms', '/data-deletion']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it('keeps the marketing home page public', () => {
    expect(isPublicPath('/')).toBe(true);
  });

  // The other half of the job: widening the list must not open the CRM.
  it('still protects the workspace', () => {
    for (const p of ['/leads', '/dashboard', '/rapoarte', '/settings', '/users', '/billing']) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it('protects the landing page editor, which only looks like a public route', () => {
    expect(isPublicPath('/landing-pages')).toBe(false);
    expect(isPublicPath('/landing-pages/abc')).toBe(false);
    expect(isPublicPath('/forms')).toBe(false);
  });

  // A prefix match on "/p" alone would open /payments and /pipeline.
  it('does not open a private route that merely starts with the same letters', () => {
    expect(isPublicPath('/payments')).toBe(false);
    expect(isPublicPath('/pipeline')).toBe(false);
    expect(isPublicPath('/platform-admin-secret')).toBe(false);
  });

  it('is not fooled by a trailing slash or an empty path', () => {
    expect(isPublicPath('/p/')).toBe(true);
    expect(isPublicPath('/p')).toBe(true);
    expect(isPublicPath('')).toBe(false);
  });
});

describe('the booking page', () => {
  // A lead sent here from Typeform has no account and never will.
  it('is reachable without signing in', () => {
    expect(isPublicPath('/book')).toBe(true);
    expect(isPublicPath('/book/consultatie-ab12cd')).toBe(true);
  });

  it('does not open anything that merely starts with the same letters', () => {
    expect(isPublicPath('/bookings')).toBe(false);
    expect(isPublicPath('/booking-settings')).toBe(false);
  });
});

describe('isPublicPath and paths that only look public', () => {
  // A dot-segment under a public prefix resolves inside the CRM while the
  // guard answered "public", so an unauthenticated visitor would be shown
  // the page while it loaded.
  it('refuses a path that climbs out of the public prefix', () => {
    expect(isPublicPath('/p/../dashboard')).toBe(false);
    expect(isPublicPath('/p/a/../../contacts')).toBe(false);
  });

  it('refuses the encoded form of the same trick', () => {
    expect(isPublicPath('/p/%2e%2e/dashboard')).toBe(false);
    expect(isPublicPath('/p/..%2fdashboard')).toBe(false);
    expect(isPublicPath('/p/%2E%2E/leads')).toBe(false);
  });

  it('still allows an ordinary slug that merely contains dots', () => {
    expect(isPublicPath('/p/oferta.2026')).toBe(true);
  });
});
