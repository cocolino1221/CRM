/**
 * Keeps an unsent call disposition safe — the React Native half.
 *
 * Same contract as frontend/lib/disposition-draft.ts, with one deliberate
 * difference: every function here returns a promise, because AsyncStorage is
 * async and pretending otherwise would mean a cache that lies on cold start.
 * A caller on a phone in a basement is exactly who loses a submit, so nothing
 * in this module may reject into the dialog: a full or locked store degrades
 * to "no draft".
 */

export interface DispositionDraft {
  outcome?: string;
  notes?: string;
  followUpAt?: string;
  dealValue?: number;
  dealCurrency?: string;
  bookingSent?: boolean;
  clientRequestId: string;
  savedAt?: string;
}

/** The slice of AsyncStorage this module needs. */
export interface DraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

const PREFIX = 'disposition-draft:';

let storageOverride: DraftStorage | null | undefined;

/** Test seam. Pass null to simulate a device with no usable store. */
export function __setDraftStorage(storage: DraftStorage | null): void {
  storageOverride = storage;
}

function storage(): DraftStorage | null {
  if (storageOverride !== undefined) return storageOverride;
  try {
    // Required lazily so a test that injects storage never loads the native
    // module — there is no native side under a plain node test runner.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    return (mod?.default ?? mod) as DraftStorage;
  } catch {
    return null;
  }
}

export async function saveDraft(activityId: string, draft: DispositionDraft): Promise<void> {
  const store = storage();
  if (!store) return;
  try {
    await store.setItem(
      PREFIX + activityId,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // SQLITE_FULL, or a store locked while the device is encrypting.
  }
}

export async function loadDraft(activityId: string): Promise<DispositionDraft | null> {
  const store = storage();
  if (!store) return null;
  try {
    const raw = await store.getItem(PREFIX + activityId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as DispositionDraft) : null;
  } catch {
    // Unreadable or half-written: start the dialog clean rather than crash it.
    return null;
  }
}

export async function clearDraft(activityId: string): Promise<void> {
  const store = storage();
  if (!store) return;
  try {
    await store.removeItem(PREFIX + activityId);
  } catch {
    // A stale draft is harmless next to a thrown dialog.
  }
}

/**
 * Drafts that were never cleared — a submit that failed and was never retried.
 * The contact list uses this to mark a call as unlogged.
 */
export async function listPendingDrafts(): Promise<
  Array<{ activityId: string; draft: DispositionDraft }>
> {
  const store = storage();
  if (!store) return [];

  const pending: Array<{ activityId: string; draft: DispositionDraft }> = [];
  try {
    const keys = await store.getAllKeys();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      const activityId = key.slice(PREFIX.length);
      const draft = await loadDraft(activityId);
      if (draft) pending.push({ activityId, draft });
    }
  } catch {
    return pending;
  }
  return pending;
}
