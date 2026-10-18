'use client';

/**
 * The question a caller answers after every call.
 *
 * Seven outcomes, one keystroke each, then submit — the spec is explicit that
 * a longer list just gets its first option clicked. Everything the caller
 * types is written to a draft as they type, and the request id is minted once
 * per dialog so a retry after a dead network cannot create a second deal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { clearDraft, loadDraft, saveDraft } from '@/lib/disposition-draft';
import {
  CALLBACK_CHOICES,
  OUTCOMES,
  buildDispositionPayload,
  describeBlocker,
  defaultFollowUpFor,
  dispositionEndpoint,
  outcomeById,
  outcomeByKey,
} from '@/lib/disposition-outcomes';

function newRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // Fall through to the timestamp form.
  }
  return `disp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DispositionDialogProps {
  /** Absent for a call that was never logged — a manual entry. */
  activityId?: string;
  contactId: string;
  contactName: string;
  durationSeconds?: number;
  /** Shown so a caller can dial straight from the dialog. */
  phone?: string;
  /** Present only when the caller recorded the call; recording is consent-gated. */
  recordingUrl?: string;
  /** Offered when the dialog opened instead of the contact panel. */
  onViewDetails?: () => void;
  onClose: () => void;
  onSaved?: () => void;
}

export function DispositionDialog({
  activityId,
  contactId,
  contactName,
  durationSeconds,
  phone,
  recordingUrl,
  onViewDetails,
  onClose,
  onSaved,
}: DispositionDialogProps) {
  // One id per dialog, not per attempt: this is what makes a retry idempotent.
  const clientRequestId = useRef<string>(newRequestId());
  const draftKey = activityId ?? `contact:${contactId}`;

  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [followUpAt, setFollowUpAt] = useState<string | null>(null);
  const [bookingSent, setBookingSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Whatever survived the last failed submit.
  useEffect(() => {
    const draft = loadDraft(draftKey);
    if (!draft) return;
    if (draft.clientRequestId) clientRequestId.current = draft.clientRequestId;
    const row = OUTCOMES.find((o) => o.outcome === draft.outcome);
    if (row) setSelected(row.id);
    if (draft.notes) setNotes(draft.notes);
    if (draft.followUpAt) setFollowUpAt(draft.followUpAt);
    if (typeof draft.dealValue === 'number') setAmount(String(draft.dealValue));
    if (draft.bookingSent) setBookingSent(true);
  }, [draftKey]);

  const row = useMemo(() => outcomeById(selected), [selected]);

  const payload = useMemo(
    () =>
      row
        ? buildDispositionPayload({
            row,
            clientRequestId: clientRequestId.current,
            contactId,
            contactName,
            notes,
            amount,
            followUpAt,
            bookingSent,
            activityId,
            durationSeconds,
          })
        : null,
    [row, contactId, contactName, notes, amount, followUpAt, bookingSent, activityId, durationSeconds],
  );

  // Written on every change, so a dead network costs nothing typed.
  useEffect(() => {
    if (!selected) return;
    saveDraft(draftKey, {
      outcome: row?.outcome,
      notes,
      followUpAt: followUpAt ?? undefined,
      dealValue: amount ? Number(amount) : undefined,
      bookingSent: bookingSent || undefined,
      clientRequestId: clientRequestId.current,
    });
  }, [draftKey, selected, row, notes, followUpAt, amount, bookingSent]);

  const pick = useCallback((id: string) => {
    setSelected(id);
    setFollowUpAt(defaultFollowUpFor(id));
  }, []);

  const submit = useCallback(async () => {
    if (!row || !payload || submitting) return;

    // The phone refuses an "interested" outcome with no readable amount; this
    // dialog used to submit it and record no deal at all, silently. Same
    // button, same action, two different results.
    const blocker = describeBlocker({
      row,
      clientRequestId: clientRequestId.current,
      contactId,
      contactName,
      notes,
      amount,
      followUpAt,
      bookingSent,
      activityId,
      durationSeconds,
    });
    if (blocker) {
      setError(blocker);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.post(dispositionEndpoint(activityId), payload);
      clearDraft(draftKey);
      onSaved?.();
      onClose();
    } catch (err: any) {
      // The draft stays. The caller can hit Salvează again and the request id
      // makes the second attempt land once.
      setError(
        err?.response?.data?.message ||
          'Nu s-a putut salva. Rezultatul e păstrat — încearcă din nou.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [row, payload, submitting, activityId, draftKey, onClose, onSaved]);

  // 1-7 pick an outcome, Enter submits, Esc leaves the draft alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      if (e.key === 'Enter' && !e.shiftKey && row) {
        e.preventDefault();
        void submit();
        return;
      }
      if (typing) return;
      const match = outcomeByKey(e.key);
      if (match) {
        e.preventDefault();
        pick(match.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pick, row, submit]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rezultatul apelului"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Cum a mers apelul cu {contactName}?
          </h2>
          {typeof durationSeconds === 'number' && (
            <p className="text-sm text-gray-500">
              Durată: {Math.floor(durationSeconds / 60)}:
              {String(durationSeconds % 60).padStart(2, '0')}
            </p>
          )}
          <div className="mt-1 flex items-center gap-3 text-sm">
            {phone && (
              <a href={`tel:${phone}`} className="font-medium text-blue-600 hover:underline">
                {phone}
              </a>
            )}
            {onViewDetails && (
              <button
                type="button"
                onClick={onViewDetails}
                className="text-gray-500 underline hover:text-gray-700 dark:hover:text-gray-300"
              >
                Vezi detalii
              </button>
            )}
          </div>
        </div>

        {recordingUrl && (
          <audio
            data-testid="call-recording"
            controls
            src={recordingUrl}
            className="mb-4 w-full"
          />
        )}

        <div className="mb-4 space-y-1.5">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              data-testid="outcome-option"
              onClick={() => pick(o.id)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                selected === o.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {o.key}
              </span>
              <span className="text-gray-900 dark:text-gray-100">{o.label}</span>
            </button>
          ))}
        </div>

        {row?.followOn === 'amount' && (
          <div className="mb-4">
            <label htmlFor="disposition-amount" className="mb-1 block text-sm font-medium">
              Sumă (RON)
            </label>
            <input
              id="disposition-amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
        )}

        {row?.followOn === 'callback' && (
          <div className="mb-4" data-testid="callback-choices">
            <span className="mb-1 block text-sm font-medium">Resună</span>
            <div className="flex flex-wrap gap-2">
              {CALLBACK_CHOICES.map((c) => {
                const iso = c.at().toISOString();
                const active = followUpAt === iso;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFollowUpAt(iso)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {row?.followOn === 'followup_date' && (
          <div className="mb-4">
            <label htmlFor="disposition-followup" className="mb-1 block text-sm font-medium">
              Revenire pe
            </label>
            <input
              id="disposition-followup"
              type="date"
              value={followUpAt ? followUpAt.slice(0, 10) : ''}
              onChange={(e) =>
                setFollowUpAt(e.target.value ? new Date(e.target.value).toISOString() : null)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
        )}

        {row?.followOn === 'booking' && (
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bookingSent}
              onChange={(e) => setBookingSent(e.target.checked)}
            />
            Am trimis link de programare
          </label>
        )}

        <div className="mb-4">
          <label htmlFor="disposition-notes" className="mb-1 block text-sm font-medium">
            Notiță
          </label>
          <textarea
            id="disposition-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
          >
            Închide
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!row || submitting}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Se salvează…' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DispositionDialog;
