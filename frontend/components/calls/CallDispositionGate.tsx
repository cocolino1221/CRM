'use client';

/**
 * Opens the disposition dialog whenever a call ends.
 *
 * Mounted once beside the global call UI, so a caller is asked about the call
 * no matter which page they were on — including after navigating away mid-call.
 */

import { useSyncExternalStore } from 'react';
import { clearEndedCall, getEndedCall, subscribeEndedCall } from '@/lib/ended-call-latch';
import { DispositionDialog } from './DispositionDialog';

export default function CallDispositionGate() {
  const ended = useSyncExternalStore(subscribeEndedCall, getEndedCall, () => null);

  if (!ended) return null;

  return (
    <DispositionDialog
      // A second call to the same contact gets a fresh dialog, and so its own
      // draft and request id.
      key={`${ended.waId}-${ended.endedAt}`}
      activityId={ended.activityId}
      contactId={ended.waId}
      contactName={ended.contactName}
      durationSeconds={ended.durationSeconds}
      recordingUrl={ended.recordingUrl}
      onClose={clearEndedCall}
    />
  );
}
