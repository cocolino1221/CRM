'use client';

import { PhoneCall, PhoneOff, Loader2, X, Mic, MicOff, Minus, Circle } from 'lucide-react';
import { callManager, useCallManager } from '@/lib/call-manager';

export default function CallModal() {
  const state = useCallManager();
  const { isOpen, waId, contactName, phase, error, duration, muted, isRecording } = state;

  if (!isOpen || !waId) return null;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">WhatsApp Call</h3>
          <button onClick={() => callManager.minimize()} className="p-1 rounded-lg hover:bg-gray-100" title="Minimize — call keeps running">
            <Minus className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center gap-3">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
            <span className="text-white text-xl font-bold">{contactName.charAt(0).toUpperCase()}</span>
          </div>
          <p className="font-semibold text-gray-900">{contactName}</p>

          {phase === 'checking_permission' && (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking calling permission...</p>
          )}

          {phase === 'needs_permission' && (
            <>
              <p className="text-sm text-gray-500">{error || "This contact hasn't granted calling permission yet."}</p>
              <button onClick={() => callManager.requestPermission()} className="mt-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700">
                Request Calling Permission
              </button>
            </>
          )}

          {phase === 'permission_requested' && (
            <>
              <p className="text-sm text-gray-500">Permission request sent. Waiting for {contactName} to accept it in WhatsApp.</p>
              <button onClick={() => callManager.checkAgain()} className="mt-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">
                Check Again
              </button>
            </>
          )}

          {(phase === 'connecting' || phase === 'ringing') && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {phase === 'connecting' ? 'Connecting...' : 'Ringing...'}
            </p>
          )}

          {phase === 'connected' && (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm text-green-600 font-medium">Connected · {formatDuration(duration)}</p>
              {isRecording && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-100">
                  <Circle className="h-2 w-2 fill-red-500 text-red-500 animate-pulse" />
                  <span className="text-[11px] font-semibold text-red-600">Recording</span>
                </span>
              )}
            </div>
          )}

          {phase === 'ended' && (
            <p className="text-sm text-gray-500">Call ended{duration > 0 ? ` · ${formatDuration(duration)}` : ''}</p>
          )}

          {phase === 'failed' && error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3 mt-3">
            {phase === 'connected' && (
              <button
                onClick={() => callManager.toggleMute()}
                className={`h-11 w-11 rounded-full flex items-center justify-center border ${muted ? 'bg-gray-200 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff className="h-4 w-4 text-gray-700" /> : <Mic className="h-4 w-4 text-gray-700" />}
              </button>
            )}
            {(phase === 'connecting' || phase === 'ringing' || phase === 'connected') && (
              <button onClick={() => void callManager.hangUp()} className="h-11 w-11 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center" title="End call">
                <PhoneOff className="h-5 w-5 text-white" />
              </button>
            )}
            {phase === 'failed' && (
              <button onClick={() => callManager.retry()} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 flex items-center gap-2">
                <PhoneCall className="h-4 w-4" /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
