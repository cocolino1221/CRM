import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraft,
  listPendingDrafts,
  loadDraft,
  saveDraft,
  __setDraftStorage,
} from './disposition-draft';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const draft = { outcome: 'no_answer', notes: 'lasat mesaj', clientRequestId: 'req-1' };

describe('disposition draft store', () => {
  beforeEach(() => {
    __setDraftStorage(memoryStorage());
  });

  it('round-trips a draft', () => {
    saveDraft('activity-1', draft as any);

    expect(loadDraft('activity-1')).toMatchObject(draft);
  });

  // listPendingDrafts has to tell an outcome abandoned two minutes ago from
  // one abandoned last month, so every save is stamped.
  it('stamps the save time', () => {
    saveDraft('activity-1', draft as any);

    expect(loadDraft('activity-1')!.savedAt).toEqual(expect.any(String));
  });

  it('returns null for an activity with no draft', () => {
    expect(loadDraft('activity-unknown')).toBeNull();
  });

  it('clears a draft', () => {
    saveDraft('activity-1', draft as any);
    clearDraft('activity-1');

    expect(loadDraft('activity-1')).toBeNull();
  });

  it('lists drafts that were never cleared', () => {
    saveDraft('activity-1', draft as any);
    saveDraft('activity-2', { ...draft, clientRequestId: 'req-2' } as any);
    clearDraft('activity-1');

    const pending = listPendingDrafts();

    expect(pending).toHaveLength(1);
    expect(pending[0].activityId).toBe('activity-2');
  });

  // A blocked or full store must degrade to "no draft", never throw into the
  // dialog — a caller losing the dialog is worse than losing the draft.
  it('survives a storage that throws on read', () => {
    __setDraftStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    });

    expect(loadDraft('activity-1')).toBeNull();
  });

  it('survives a storage that throws on write', () => {
    __setDraftStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    });

    expect(() => saveDraft('activity-1', draft as any)).not.toThrow();
  });

  it('ignores unrelated keys already in storage', () => {
    const storage = memoryStorage();
    storage.setItem('theme', 'dark');
    __setDraftStorage(storage);

    saveDraft('activity-1', draft as any);

    expect(listPendingDrafts()).toHaveLength(1);
  });

  it('discards a corrupted entry rather than throwing', () => {
    const storage = memoryStorage();
    __setDraftStorage(storage);
    saveDraft('activity-1', draft as any);
    // Simulate a half-written value.
    const key = storage.key(0)!;
    storage.setItem(key, '{not json');

    expect(loadDraft('activity-1')).toBeNull();
    expect(listPendingDrafts()).toHaveLength(0);
  });

  it('survives being used with no storage at all', () => {
    __setDraftStorage(null);

    expect(() => saveDraft('activity-1', draft as any)).not.toThrow();
    expect(loadDraft('activity-1')).toBeNull();
    expect(listPendingDrafts()).toEqual([]);
  });
});
