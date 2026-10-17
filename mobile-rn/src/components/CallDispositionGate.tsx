import { useEffect, useState } from 'react';
import { clearEndedCall, getEndedCall, subscribeEndedCall } from '../lib/ended-call-latch';
import DispositionDialog from './DispositionDialog';

/**
 * Opens the disposition dialog whenever a call ends.
 *
 * Mounted once in App.tsx beside CallModal, so the caller is asked about the
 * call whichever screen they are on — and after the call store has already
 * wiped its own state.
 */
export default function CallDispositionGate() {
  const [ended, setEnded] = useState(getEndedCall);

  useEffect(() => subscribeEndedCall(() => setEnded(getEndedCall())), []);

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
      phone={ended.waId}
      recordingUrl={ended.recordingUrl}
      onClose={clearEndedCall}
    />
  );
}
