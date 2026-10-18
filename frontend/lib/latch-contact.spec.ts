import { describe, expect, it } from 'vitest';
import { clearEndedCall, getEndedCall, latchEndedCall } from './ended-call-latch';

/**
 * The latch carried no contact id, so both gates passed `waId` — a phone
 * number — as `contactId`. When the call log had failed and there was no
 * activity to attach to, the dialog posted that phone number into a field
 * the server validates as a UUID: 400, every time, for exactly the case the
 * latch's optional activityId exists to cover.
 */
describe('the ended-call latch', () => {
  it('carries the contact it was about', () => {
    clearEndedCall();

    latchEndedCall({
      waId: '40722000111',
      contactId: '6f0f2e6c-1b3a-4a1f-9f2e-0e6f1a2b3c4d',
      contactName: 'Ionela Pop',
      durationSeconds: 90,
    });

    expect(getEndedCall()?.contactId).toBe('6f0f2e6c-1b3a-4a1f-9f2e-0e6f1a2b3c4d');
    expect(getEndedCall()?.waId).toBe('40722000111');
  });

  it('keeps the two apart when the contact is unknown', () => {
    clearEndedCall();

    latchEndedCall({ waId: '40722000111', contactName: 'Ionela', durationSeconds: 10 });

    expect(getEndedCall()?.contactId).toBeUndefined();
    expect(getEndedCall()?.waId).toBe('40722000111');
  });

  // A technical failure used to leave the previous call latched, so the
  // caller was asked about the wrong conversation.
  it('clears a stale call when the next one fails to connect', () => {
    clearEndedCall();
    latchEndedCall({ waId: '40722000111', contactName: 'A', durationSeconds: 60 });

    latchEndedCall({ waId: '40733000222', contactName: 'B', durationSeconds: 0, status: 'failed' });

    expect(getEndedCall()).toBeNull();
  });
});
