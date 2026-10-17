import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDraft,
  listPendingDrafts,
  loadDraft,
  saveDraft,
  __setDraftStorage,
} from './disposition-draft';

/** Mirrors AsyncStorage's async surface, in memory. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
    getAllKeys: async () => Array.from(map.keys()),
    _raw: map,
  };
}

const draft = { outcome: 'no_answer', notes: 'lasat mesaj', clientRequestId: 'req-1' };

describe('disposition draft store (react native)', () => {
  beforeEach(() => {
    __setDraftStorage(memoryStorage());
  });

  it('round-trips a draft', async () => {
    await saveDraft('activity-1', draft as any);

    await expect(loadDraft('activity-1')).resolves.toMatchObject(draft);
  });

  // listPendingDrafts has to tell an outcome abandoned two minutes ago from
  // one abandoned last month, so every save is stamped.
  it('stamps the save time', async () => {
    await saveDraft('activity-1', draft as any);

    expect((await loadDraft('activity-1'))!.savedAt).toEqual(expect.any(String));
  });

  it('returns null for an activity with no draft', async () => {
    await expect(loadDraft('activity-unknown')).resolves.toBeNull();
  });

  it('clears a draft', async () => {
    await saveDraft('activity-1', draft as any);
    await clearDraft('activity-1');

    await expect(loadDraft('activity-1')).resolves.toBeNull();
  });

  it('lists drafts that were never cleared', async () => {
    await saveDraft('activity-1', draft as any);
    await saveDraft('activity-2', { ...draft, clientRequestId: 'req-2' } as any);
    await clearDraft('activity-1');

    const pending = await listPendingDrafts();

    expect(pending).toHaveLength(1);
    expect(pending[0].activityId).toBe('activity-2');
  });

  // A caller on a phone is exactly who hits a full or locked store. Losing the
  // draft is bad; throwing into the dialog mid-call is worse.
  it('survives a storage that rejects on read', async () => {
    __setDraftStorage({
      getItem: async () => {
        throw new Error('database disk image is malformed');
      },
      setItem: async () => undefined,
      removeItem: async () => undefined,
      getAllKeys: async () => [],
    });

    await expect(loadDraft('activity-1')).resolves.toBeNull();
  });

  it('survives a storage that rejects on write', async () => {
    __setDraftStorage({
      getItem: async () => null,
      setItem: async () => {
        throw new Error('SQLITE_FULL');
      },
      removeItem: async () => undefined,
      getAllKeys: async () => [],
    });

    await expect(saveDraft('activity-1', draft as any)).resolves.toBeUndefined();
  });

  it('ignores unrelated keys already in storage', async () => {
    const storage = memoryStorage();
    storage._raw.set('auth-token', 'xyz');
    __setDraftStorage(storage);

    await saveDraft('activity-1', draft as any);

    await expect(listPendingDrafts()).resolves.toHaveLength(1);
  });

  it('discards a corrupted entry rather than throwing', async () => {
    const storage = memoryStorage();
    __setDraftStorage(storage);
    await saveDraft('activity-1', draft as any);
    const key = Array.from(storage._raw.keys())[0];
    storage._raw.set(key, '{not json');

    await expect(loadDraft('activity-1')).resolves.toBeNull();
    await expect(listPendingDrafts()).resolves.toHaveLength(0);
  });

  it('survives being used with no storage at all', async () => {
    __setDraftStorage(null);

    await expect(saveDraft('activity-1', draft as any)).resolves.toBeUndefined();
    await expect(loadDraft('activity-1')).resolves.toBeNull();
    await expect(listPendingDrafts()).resolves.toEqual([]);
  });
});
