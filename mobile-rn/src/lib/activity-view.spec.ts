import { describe, expect, it } from 'vitest';
import { activityHeadline, activityNote, activityTone, parseActivityList } from './activity-view';

describe('lead history', () => {
  it('reads the { data, total } shape GET /activities actually returns', () => {
    const rows = parseActivityList({ data: [{ id: 'a1' }], total: 1 });
    expect(rows).toHaveLength(1);
    expect(parseActivityList([{ id: 'a2' }])).toHaveLength(1);
    expect(parseActivityList(null)).toEqual([]);
  });

  it('names a call by how it went', () => {
    const call = { id: 'a', type: 'call', title: 'Call', occurredAt: '' };
    expect(activityHeadline({ ...call, outcome: 'failed' })).toBe('Apel — refuz');
    expect(activityHeadline({ ...call, outcome: 'no_answer' })).toBe('Apel — n-a răspuns');
    expect(activityHeadline({ ...call, outcome: 'successful', dealId: 'd1' })).toBe('Apel — vândut');
    expect(activityHeadline({ id: 'b', type: 'whatsapp_message', title: 'WhatsApp', occurredAt: '' })).toBe('WhatsApp');
  });

  it('shows the note the caller typed', () => {
    expect(activityNote({ id: 'a', type: 'call', title: '', occurredAt: '', followUpNotes: 'Anul viitor' })).toBe('Anul viitor');
    expect(activityNote({ id: 'a', type: 'call', title: '', occurredAt: '', description: ' ' })).toBeUndefined();
  });

  it('colours refusals red and sales green', () => {
    const call = { id: 'a', type: 'call', title: '', occurredAt: '' };
    expect(activityTone({ ...call, outcome: 'failed' })).toBe('red');
    expect(activityTone({ ...call, outcome: 'scheduled' })).toBe('green');
    expect(activityTone({ ...call, outcome: 'no_answer' })).toBe('amber');
  });
});
