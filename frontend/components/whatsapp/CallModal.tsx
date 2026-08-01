'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneCall, PhoneOff, Loader2, X, Mic, MicOff } from 'lucide-react';
import api from '@/lib/api';

type CallPhase =
  | 'checking_permission'
  | 'needs_permission'
  | 'permission_requested'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'ended'
  | 'failed';

interface CallModalProps {
  waId: string;
  contactName: string;
  onClose: () => void;
}

// Public STUN-only for our side — Meta's Calling API terminates the call on
// their own infrastructure, which is expected to supply its half of ICE
// candidates via the SDP answer it returns. No TURN server configured here;
// if real-world NAT traversal needs one, this is the first thing to revisit.
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function CallModal({ waId, contactName, onClose }: CallModalProps) {
  const [phase, setPhase] = useState<CallPhase>('checking_permission');
  const [error, setError] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);

  const cleanup = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    eventSourceRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current = null;
    eventSourceRef.current = null;
  };

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    checkPermissionAndMaybeStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waId]);

  const checkPermissionAndMaybeStart = async () => {
    setPhase('checking_permission');
    setError('');
    try {
      const res = await api.get(`/integrations/whatsapp/calls/permission-status/${waId}`);
      const status = res.data?.status;
      if (status === 'granted') {
        void startCall();
      } else {
        setPhase('needs_permission');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to check calling permission');
      setPhase('failed');
    }
  };

  const requestPermission = async () => {
    setError('');
    try {
      await api.post('/integrations/whatsapp/calls/permission-request', { waId });
      setPhase('permission_requested');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send permission request');
    }
  };

  const openEventStream = (onEvent: (payload: any) => void) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const base = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';
    const url = `${base}/integrations/whatsapp/calls/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const source = new EventSource(url, { withCredentials: true });
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && typeof payload === 'object') onEvent(payload);
      } catch {
        // ignore malformed/heartbeat frames
      }
    };
    eventSourceRef.current = source;
    return source;
  };

  const startCall = async () => {
    setPhase('connecting');
    setError('');
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          void remoteAudioRef.current.play().catch(() => {});
        }
      };

      openEventStream((payload) => {
        if (payload.type !== 'webhook' && payload.type !== 'initiated' && payload.type !== 'terminated') return;
        if (callIdRef.current && payload.callId && payload.callId !== callIdRef.current) return;

        if (payload.type === 'initiated' && payload.callId) {
          callIdRef.current = payload.callId;
          setCallId(payload.callId);
        }

        if (payload.session?.sdp_type === 'answer' && payload.session?.sdp) {
          pc.setRemoteDescription({ type: 'answer', sdp: payload.session.sdp })
            .then(() => {
              setPhase('connected');
              startDurationTimer();
            })
            .catch((err) => setError(`Failed to establish call audio: ${err.message}`));
        }

        if (payload.type === 'terminated' || payload.event === 'terminate' || payload.event === 'reject') {
          setPhase('ended');
          cleanup();
        }
      });

      // Non-trickle ICE: wait for gathering to finish so the offer carries
      // every candidate in one shot (no bidirectional low-latency channel
      // to trickle candidates over otherwise).
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', check);
      });

      const finalSdp = pc.localDescription?.sdp;
      if (!finalSdp) throw new Error('Failed to generate call offer');

      const res = await api.post('/integrations/whatsapp/calls/initiate', { waId, sdpOffer: finalSdp });
      if (res.data?.callId) {
        callIdRef.current = res.data.callId;
        setCallId(res.data.callId);
      }
      setPhase('ringing');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to start call');
      setPhase('failed');
      cleanup();
    }
  };

  const startDurationTimer = () => {
    setDuration(0);
    durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  };

  const endCall = async () => {
    const id = callIdRef.current;
    cleanup();
    setPhase('ended');
    if (id) {
      try {
        await api.post(`/integrations/whatsapp/calls/${id}/terminate`);
      } catch {
        // best-effort — the call is already torn down locally
      }
    }
  };

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
          <button onClick={() => { cleanup(); onClose(); }} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
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
              <p className="text-sm text-gray-500">This contact hasn&apos;t granted calling permission yet. WhatsApp requires asking first.</p>
              <button onClick={requestPermission} className="mt-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700">
                Request Calling Permission
              </button>
            </>
          )}

          {phase === 'permission_requested' && (
            <>
              <p className="text-sm text-gray-500">Permission request sent. Waiting for {contactName} to accept it in WhatsApp.</p>
              <button onClick={checkPermissionAndMaybeStart} className="mt-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">
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
            <p className="text-sm text-green-600 font-medium">Connected · {formatDuration(duration)}</p>
          )}

          {phase === 'ended' && (
            <p className="text-sm text-gray-500">Call ended{duration > 0 ? ` · ${formatDuration(duration)}` : ''}</p>
          )}

          {phase === 'failed' && error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <audio ref={remoteAudioRef} autoPlay className="hidden" />

          <div className="flex items-center gap-3 mt-3">
            {phase === 'connected' && (
              <button
                onClick={toggleMute}
                className={`h-11 w-11 rounded-full flex items-center justify-center border ${muted ? 'bg-gray-200 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff className="h-4 w-4 text-gray-700" /> : <Mic className="h-4 w-4 text-gray-700" />}
              </button>
            )}
            {(phase === 'connecting' || phase === 'ringing' || phase === 'connected') && (
              <button onClick={endCall} className="h-11 w-11 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center" title="End call">
                <PhoneOff className="h-5 w-5 text-white" />
              </button>
            )}
            {phase === 'failed' && (
              <button onClick={checkPermissionAndMaybeStart} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 flex items-center gap-2">
                <PhoneCall className="h-4 w-4" /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
