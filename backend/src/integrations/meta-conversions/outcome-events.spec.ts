import { META_EVENT, outcomeEvent, outcomeEventId } from './outcome-events';

describe('outcomeEvent', () => {
  it('turns the outcomes that matter to ads into events', () => {
    expect(outcomeEvent({ outcome: 'successful', deal: { value: 100 } })).toBe(META_EVENT.won);
    expect(outcomeEvent({ outcome: 'failed' })).toBe(META_EVENT.lost);
    expect(outcomeEvent({ outcome: 'scheduled' })).toBe(META_EVENT.scheduled);
  });

  it('sends nothing for a note, a call-back or no answer', () => {
    expect(outcomeEvent({ outcome: 'successful' })).toBeNull();
    expect(outcomeEvent({ outcome: 'no_answer' })).toBeNull();
    expect(outcomeEvent({})).toBeNull();
  });

  it('gives each event a stable id so a re-save counts once', () => {
    expect(outcomeEventId('act-1', META_EVENT.won)).toBe('act-1:Vandut');
  });
});
