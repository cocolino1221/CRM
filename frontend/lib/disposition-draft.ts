/**
 * Keeps an unsent call disposition safe.
 *
 * A caller is often on a phone with bad signal. If a submit fails and the
 * dialog loses what they typed, they stop trusting it and work around it —
 * which is how the outcome ends up in a spreadsheet instead of the CRM. So
 * every keystroke is written down, and nothing here may ever throw into the
 * dialog: a blocked or full store degrades to "no draft".
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

/** The slice of Storage this module needs; RN supplies the same shape. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const PREFIX = 'disposition-draft:';

let storageOverride: DraftStorage | null | undefined;

/** Test seam. Pass null to simulate a browser with no storage at all. */
export function __setDraftStorage(storage: DraftStorage | null): void {
  storageOverride = storage;
}

function storage(): DraftStorage | null {
  if (storageOverride !== undefined) return storageOverride;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage as unknown as DraftStorage;
  } catch {
    // Accessing localStorage throws outright when site data is blocked.
    return null;
  }
}

export function saveDraft(activityId: string, draft: DispositionDraft): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      PREFIX + activityId,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Quota exceeded or private mode. Losing the draft is bad; throwing into
    // the dialog mid-call is worse.
  }
}

export function loadDraft(activityId: string): DispositionDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + activityId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as DispositionDraft) : null;
  } catch {
    // Unreadable or half-written: treat as absent and let the dialog start clean.
    return null;
  }
}

export function clearDraft(activityId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + activityId);
  } catch {
    // Nothing to do; a stale draft is harmless next to a thrown dialog.
  }
}

/**
 * Drafts that were never cleared — a submit that failed and was never retried.
 * The contact list uses this to mark a call as unlogged.
 */
export function listPendingDrafts(): Array<{ activityId: string; draft: DispositionDraft }> {
  const store = storage();
  if (!store) return [];

  const pending: Array<{ activityId: string; draft: DispositionDraft }> = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const activityId = key.slice(PREFIX.length);
      const draft = loadDraft(activityId);
      if (draft) pending.push({ activityId, draft });
    }
  } catch {
    return pending;
  }
  return pending;
}
