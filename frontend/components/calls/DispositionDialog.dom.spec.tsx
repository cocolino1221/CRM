import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const post = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { post: (...args: any[]) => post(...args) },
  default: { post: (...args: any[]) => post(...args) },
}));

import { DispositionDialog } from './DispositionDialog';
import { __setDraftStorage, loadDraft, saveDraft } from '@/lib/disposition-draft';

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

const base = {
  activityId: 'activity-1',
  contactId: 'contact-1',
  contactName: 'Ionela Pop',
  durationSeconds: 92,
  onClose: () => {},
};

describe('DispositionDialog', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { success: true } });
    __setDraftStorage(memoryStorage());
  });

  it('shows the seven outcomes from the spec and no more', () => {
    render(<DispositionDialog {...base} />);

    for (const label of [
      'A răspuns — interesat',
      'A răspuns — nu acum',
      'A răspuns — refuz',
      'N-a răspuns',
      'Mesagerie vocală',
      'Ocupat',
      'Programat',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.getAllByTestId('outcome-option')).toHaveLength(7);
  });

  it('names the contact being dispositioned', () => {
    render(<DispositionDialog {...base} />);

    expect(screen.getByText(/Ionela Pop/)).toBeTruthy();
  });

  // The spec's table: only "interesat" asks for an amount.
  it('asks for an amount only after an interested outcome', async () => {
    const user = userEvent.setup();
    render(<DispositionDialog {...base} />);

    expect(screen.queryByLabelText(/Sumă/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /A răspuns — interesat/ }));

    expect(screen.getByLabelText(/Sumă/)).toBeTruthy();
  });

  it('asks for a callback time after no answer', async () => {
    const user = userEvent.setup();
    render(<DispositionDialog {...base} />);

    await user.click(screen.getByRole('button', { name: /N-a răspuns/ }));

    expect(screen.getByTestId('callback-choices')).toBeTruthy();
  });

  it('selects an outcome by its number key', async () => {
    const user = userEvent.setup();
    render(<DispositionDialog {...base} />);

    await user.keyboard('4');

    expect(screen.getByTestId('callback-choices')).toBeTruthy();
  });

  it('posts the outcome to the activity disposition endpoint', async () => {
    const user = userEvent.setup();
    render(<DispositionDialog {...base} />);

    await user.click(screen.getByRole('button', { name: /A răspuns — refuz/ }));
    await user.click(screen.getByRole('button', { name: /^Salvează/ }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/activities/activity-1/disposition');
    expect(body.outcome).toBe('failed');
  });

  // No activityId means the call was never logged — a manual entry.
  it('posts to the create-and-disposition endpoint when there is no activity', async () => {
    const user = userEvent.setup();
    render(<DispositionDialog {...base} activityId={undefined} />);

    await user.click(screen.getByRole('button', { name: /Ocupat/ }));
    await user.click(screen.getByRole('button', { name: /^Salvează/ }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/activities/disposition');
    expect(body.contactId).toBe('contact-1');
  });

  // Review Focus — a caller who double-taps submit, or retries after a
  // timeout, must not create two deals. One id per dialog, not per attempt.
  it('reuses one clientRequestId across submit attempts', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(new Error('Network Error'));
    render(<DispositionDialog {...base} />);

    await user.click(screen.getByRole('button', { name: /Ocupat/ }));
    await user.click(screen.getByRole('button', { name: /^Salvează/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /^Salvează/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    expect(post.mock.calls[1][1].clientRequestId).toBe(post.mock.calls[0][1].clientRequestId);
  });

  it('keeps the draft when the submit fails', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('Network Error'));
    render(<DispositionDialog {...base} />);

    await user.click(screen.getByRole('button', { name: /Ocupat/ }));
    await user.click(screen.getByRole('button', { name: /^Salvează/ }));

    await waitFor(() => expect(loadDraft('activity-1')).not.toBeNull());
  });

  it('clears the draft once the submit succeeds', async () => {
    const user = userEvent.setup();
    render(<DispositionDialog {...base} />);

    await user.click(screen.getByRole('button', { name: /Ocupat/ }));
    await user.click(screen.getByRole('button', { name: /^Salvează/ }));

    await waitFor(() => expect(loadDraft('activity-1')).toBeNull());
  });

  it('restores what the caller typed before the last failure', async () => {
    saveDraft('activity-1', {
      outcome: 'busy',
      notes: 'suna inapoi dupa 18',
      clientRequestId: 'req-old',
    });

    render(<DispositionDialog {...base} />);

    expect((screen.getByLabelText(/Notiță/) as HTMLTextAreaElement).value).toBe(
      'suna inapoi dupa 18',
    );
  });

  it('closes on Escape without losing the draft', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DispositionDialog {...base} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /Ocupat/ }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(loadDraft('activity-1')).not.toBeNull();
  });

  it('offers the recording when the call was recorded', () => {
    render(<DispositionDialog {...base} recordingUrl="https://cdn.example.com/call-1.webm" />);

    expect(screen.getByTestId('call-recording')).toBeTruthy();
  });

  it('shows no player for a call that was not recorded', () => {
    render(<DispositionDialog {...base} />);

    expect(screen.queryByTestId('call-recording')).toBeNull();
  });

  it('will not submit before an outcome is chosen', () => {
    render(<DispositionDialog {...base} />);

    expect((screen.getByRole('button', { name: /^Salvează/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
