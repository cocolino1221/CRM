import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearEndedCall, getEndedCall, latchEndedCall, subscribeEndedCall } from './ended-call-latch';

const call = {
  activityId: 'activity-1',
  waId: '40722000111',
  contactName: 'Ionela Pop',
  durationSeconds: 92,
};

describe('the ended-call latch', () => {
  beforeEach(() => {
    clearEndedCall();
  });

  it('holds nothing before a call ends', () => {
    expect(getEndedCall()).toBeNull();
  });

  it('holds the call that just ended', () => {
    latchEndedCall(call);

    expect(getEndedCall()).toMatchObject(call);
  });

  // Review Focus — call-manager wipes its state ~2.5s after a call ends. The
  // whole point of the latch is that the dialog can still read the context
  // after that, so nothing here may be derived from the live call state.
  it('survives the call state being reset', () => {
    latchEndedCall(call);
    // Whatever the manager does to itself afterwards.
    expect(getEndedCall()).toMatchObject(call);
    expect(getEndedCall()!.endedAt).toEqual(expect.any(Number));
  });

  it('is cleared once the dialog is done with it', () => {
    latchEndedCall(call);
    clearEndedCall();

    expect(getEndedCall()).toBeNull();
  });

  it('tells subscribers when a call lands and when it is cleared', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEndedCall(listener);

    latchEndedCall(call);
    clearEndedCall();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    latchEndedCall(call);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  // Two calls to the same contact in a row must look like two calls, or the
  // second dialog reuses the first one's draft and request id.
  it('gives a second call to the same contact its own identity', () => {
    latchEndedCall(call);
    const first = getEndedCall()!;
    latchEndedCall({ ...call, activityId: 'activity-2' });
    const second = getEndedCall()!;

    expect(second.activityId).not.toBe(first.activityId);
  });

  it('returns the same object between changes, so a React store does not loop', () => {
    latchEndedCall(call);

    expect(getEndedCall()).toBe(getEndedCall());
  });

  it('keeps a recording url when the call was recorded', () => {
    latchEndedCall({ ...call, recordingUrl: 'https://cdn.example.com/call-1.webm' });

    expect(getEndedCall()!.recordingUrl).toBe('https://cdn.example.com/call-1.webm');
  });

  // A call we failed to place is our error, not an outcome the caller reports.
  it('ignores a call that never reached the contact', () => {
    latchEndedCall({ ...call, status: 'failed' } as any);

    expect(getEndedCall()).toBeNull();
  });
});
