'use client';

import { PhoneOff, PhoneCall, Circle } from 'lucide-react';
import { callManager, useCallManager } from '@/lib/call-manager';

/** Persistent call-in-progress bar shown app-wide when the call modal is minimized. */
export default function MiniCallBar() {
  const state = useCallManager();
  const { isOpen, waId, contactName, phase, duration, isRecording } = state;

  if (!waId || isOpen) return null;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const statusText =
    phase === 'connected' ? `Connected · ${formatDuration(duration)}`
    : phase === 'ringing' ? 'Ringing...'
    : phase === 'connecting' ? 'Connecting...'
    : phase === 'ended' ? 'Call ended'
    : phase === 'failed' ? 'Call failed'
    : 'Calling...';

  return (
    <button
      onClick={() => callManager.maximize()}
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-3 pr-4 py-2 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800 transition-colors"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
        <PhoneCall className="h-4 w-4" />
      </span>
      <span className="text-left">
        <span className="block text-xs font-semibold leading-tight">{contactName}</span>
        <span className="flex items-center gap-1 text-[11px] text-gray-300 leading-tight">
          {isRecording && <Circle className="h-1.5 w-1.5 fill-red-500 text-red-500" />}
          {statusText}
        </span>
      </span>
      {(phase === 'connecting' || phase === 'ringing' || phase === 'connected') && (
        <span
          onClick={(e) => { e.stopPropagation(); void callManager.hangUp(); }}
          className="h-7 w-7 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center"
          title="End call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}
