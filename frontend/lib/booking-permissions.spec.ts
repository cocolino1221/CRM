import { describe, expect, it } from 'vitest';
import { canManageBooking } from './booking-permissions';

describe('canManageBooking', () => {
  const booking = { host: { id: 'closer-1' } };

  it('offers the actions to the booking’s own closer', () => {
    expect(canManageBooking({ id: 'closer-1', role: 'closer' }, booking)).toBe(true);
  });

  it('hides them from another closer, a setter or a caller', () => {
    expect(canManageBooking({ id: 'closer-2', role: 'closer' }, booking)).toBe(false);
    expect(canManageBooking({ id: 's', role: 'setter' }, booking)).toBe(false);
    expect(canManageBooking({ id: 'c', role: 'CALLER' }, booking)).toBe(false);
  });

  it('shows them to admins and managers', () => {
    expect(canManageBooking({ id: 'a', role: 'admin' }, booking)).toBe(true);
    expect(canManageBooking({ id: 'm', role: 'manager' }, booking)).toBe(true);
  });

  it('hides them when nobody is signed in or the booking has no host', () => {
    expect(canManageBooking(null, booking)).toBe(false);
    expect(canManageBooking({ id: 'closer-1', role: 'closer' }, { host: null })).toBe(false);
  });
});
