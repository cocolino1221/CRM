'use client';

import { useEffect, useRef } from 'react';
import { callManager } from '@/lib/call-manager';
import CallModal from './CallModal';
import MiniCallBar from './MiniCallBar';

/**
 * Mounted once at the dashboard layout level (not per-page) so an active
 * call survives navigation — including into meta-inbox/Messenger — and the
 * remote <audio> element never unmounts while minimized.
 */
export default function GlobalCallUI() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    callManager.setAudioElement(audioRef.current);
    return () => callManager.setAudioElement(null);
  }, []);

  return (
    <>
      <audio ref={audioRef} autoPlay className="hidden" />
      <CallModal />
      <MiniCallBar />
    </>
  );
}
