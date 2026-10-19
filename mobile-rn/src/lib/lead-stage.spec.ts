import { describe, expect, it } from 'vitest';
import { bookedContactIds, leadStage, stageForTab } from './lead-stage';

describe('stageForTab', () => {
  const unscheduled = leadStage({ id: 'c1', lastContactedAt: '2026-10-14' }, new Set());

  it('says Pierdut under Pierdut instead of Neprogramat', () => {
    expect(stageForTab(unscheduled, 'lost').label).toBe('Pierdut');
  });

  it('says Vândut under Vândut', () => {
    expect(stageForTab(unscheduled, 'won').label).toBe('Vândut');
  });

  it('keeps the usual badge everywhere else', () => {
    expect(stageForTab(unscheduled, 'new').label).toBe('Neprogramat');
    expect(stageForTab(unscheduled, '').label).toBe('Neprogramat');
  });
});

describe('leadStage', () => {
  // The three words a caller cares about. "Contacted" — the pipeline stage
  // the row used to show — answered a question nobody was asking.
  it('calls a contact with an appointment ahead of them scheduled', () => {
    const s = leadStage({ id: 'c-1', lastContactedAt: '2026-10-01' }, new Set(['c-1']));

    expect(s.key).toBe('scheduled');
    expect(s.label).toBe('Programat');
  });

  it('calls a worked contact with no appointment unscheduled', () => {
    const s = leadStage({ id: 'c-1', lastContactedAt: '2026-10-01' }, new Set());

    expect(s.key).toBe('unscheduled');
    expect(s.label).toBe('Neprogramat');
  });

  it('calls an untouched contact new', () => {
    const s = leadStage({ id: 'c-1' }, new Set());

    expect(s.key).toBe('new');
    expect(s.label).toBe('Nou');
  });

  // A booking outranks everything: someone booked is booked, whether or not
  // anyone recorded a call first.
  it('prefers scheduled over new', () => {
    expect(leadStage({ id: 'c-1' }, new Set(['c-1'])).key).toBe('scheduled');
  });

  it('treats an empty contacted date as never contacted', () => {
    expect(leadStage({ id: 'c-1', lastContactedAt: null }, new Set()).key).toBe('new');
    expect(leadStage({ id: 'c-1', lastContactedAt: '' }, new Set()).key).toBe('new');
  });

  it('gives each state its own colour', () => {
    const keys = ['new', 'scheduled', 'unscheduled'];
    const colours = keys.map((k) =>
      leadStage(
        { id: 'c', lastContactedAt: k === 'new' ? null : '2026-01-01' },
        new Set(k === 'scheduled' ? ['c'] : []),
      ).color,
    );

    expect(new Set(colours).size).toBe(3);
  });

  it('survives being handed nothing', () => {
    expect(leadStage(null as any, new Set()).key).toBe('new');
  });
});

describe('bookedContactIds', () => {
  it('collects the contact behind each booking', () => {
    const ids = bookedContactIds([
      { id: 'b1', contact: { id: 'c-1' } },
      { id: 'b2', contact: { id: 'c-2' } },
    ]);

    expect(ids).toEqual(new Set(['c-1', 'c-2']));
  });

  it('reads a flat contactId too, since the API has used both', () => {
    expect(bookedContactIds([{ id: 'b1', contactId: 'c-9' }])).toEqual(new Set(['c-9']));
  });

  it('ignores a booking with no contact', () => {
    expect(bookedContactIds([{ id: 'b1' }, { id: 'b2', contact: null }])).toEqual(new Set());
  });

  it('returns an empty set for anything that is not a list', () => {
    expect(bookedContactIds(undefined as any)).toEqual(new Set());
    expect(bookedContactIds({} as any)).toEqual(new Set());
  });
});
