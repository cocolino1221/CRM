import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { PhoneOff, Mic, MicOff, PhoneCall, X } from 'lucide-react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore — no bundled types for the RTC* constructors' generic shapes
import { RTCPeerConnection, mediaDevices, MediaStream } from 'react-native-webrtc';
import EventSource from 'react-native-sse';
import api, { API_BASE_URL } from '../lib/api';

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
  visible: boolean;
  waId: string;
  contactName: string;
  onClose: () => void;
}

// See web CallModal for the same note: STUN-only for our side, Meta's
// Calling infrastructure supplies its half via the SDP answer.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function CallModal({ visible, waId, contactName, onClose }: CallModalProps) {
  const [phase, setPhase] = useState<CallPhase>('checking_permission');
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);

  const cleanup = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    eventSourceRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current = null;
    eventSourceRef.current = null;
    callIdRef.current = null;
  };

  useEffect(() => {
    if (!visible) return;
    checkPermissionAndMaybeStart();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, waId]);

  const checkPermissionAndMaybeStart = async () => {
    setPhase('checking_permission');
    setError('');
    setDuration(0);
    try {
      const res = await api.get(`/integrations/whatsapp/calls/permission-status/${waId}`);
      if (res.data?.status === 'granted') {
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

  const openEventStream = async (onEvent: (payload: any) => void) => {
    const token = await AsyncStorage.getItem('accessToken');
    const es = new EventSource(`${API_BASE_URL}/integrations/whatsapp/calls/stream`, {
      headers: token ? { Authorization: { toString: () => `Bearer ${token}` } as any } : undefined,
    });
    es.addEventListener('message', (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && typeof payload === 'object') onEvent(payload);
      } catch {
        // ignore malformed/heartbeat frames
      }
    });
    eventSourceRef.current = es;
  };

  const startCall = async () => {
    setPhase('connecting');
    setError('');
    try {
      const micPermission = await Audio.requestPermissionsAsync();
      if (!micPermission.granted) {
        throw new Error('Microphone permission is required to place a call');
      }

      const localStream: MediaStream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      localStream.getTracks().forEach((track: any) => pc.addTrack(track, localStream));
      // react-native-webrtc routes remote audio to the device speaker/earpiece
      // automatically once a remote track arrives — no player element needed.

      await openEventStream((payload) => {
        if (payload.type !== 'webhook' && payload.type !== 'initiated' && payload.type !== 'terminated') return;
        if (callIdRef.current && payload.callId && payload.callId !== callIdRef.current) return;

        if (payload.type === 'initiated' && payload.callId) {
          callIdRef.current = payload.callId;
        }

        if (payload.session?.sdp_type === 'answer' && payload.session?.sdp) {
          pc.setRemoteDescription({ type: 'answer', sdp: payload.session.sdp })
            .then(() => {
              setPhase('connected');
              durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
            })
            .catch((err: any) => setError(`Failed to establish call audio: ${err.message}`));
        }

        if (payload.type === 'terminated' || payload.event === 'terminate' || payload.event === 'reject') {
          setPhase('ended');
          cleanup();
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.onicegatheringstatechange = null;
            resolve();
          }
        };
      });

      const finalSdp = pc.localDescription?.sdp;
      if (!finalSdp) throw new Error('Failed to generate call offer');

      const res = await api.post('/integrations/whatsapp/calls/initiate', { waId, sdpOffer: finalSdp });
      if (res.data?.callId) callIdRef.current = res.data.callId;
      setPhase('ringing');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to start call');
      setPhase('failed');
      cleanup();
    }
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track: any) => { track.enabled = !nextMuted; });
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
        // best-effort — call is already torn down locally
      }
    }
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View className="flex-1 bg-black/60 items-center justify-center px-6">
        <View className="w-full bg-white rounded-2xl overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <Text className="text-sm font-semibold text-gray-900">WhatsApp Call</Text>
            <TouchableOpacity onPress={handleClose} className="p-1">
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <View className="px-6 py-8 items-center">
            <View className="h-16 w-16 rounded-full bg-emerald-500 items-center justify-center mb-3">
              <Text className="text-white text-xl font-bold">{contactName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text className="font-semibold text-gray-900 mb-2">{contactName}</Text>

            {phase === 'checking_permission' && (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#6b7280" />
                <Text className="text-sm text-gray-500 ml-2">Checking calling permission...</Text>
              </View>
            )}

            {phase === 'needs_permission' && (
              <>
                <Text className="text-sm text-gray-500 text-center mb-3">
                  This contact hasn&apos;t granted calling permission yet. WhatsApp requires asking first.
                </Text>
                <TouchableOpacity onPress={requestPermission} className="px-4 py-2.5 bg-emerald-600 rounded-xl">
                  <Text className="text-sm font-semibold text-white">Request Calling Permission</Text>
                </TouchableOpacity>
              </>
            )}

            {phase === 'permission_requested' && (
              <>
                <Text className="text-sm text-gray-500 text-center mb-3">
                  Permission request sent. Waiting for {contactName} to accept it in WhatsApp.
                </Text>
                <TouchableOpacity onPress={checkPermissionAndMaybeStart} className="px-4 py-2.5 border border-gray-300 rounded-xl">
                  <Text className="text-sm font-medium text-gray-700">Check Again</Text>
                </TouchableOpacity>
              </>
            )}

            {(phase === 'connecting' || phase === 'ringing') && (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#6b7280" />
                <Text className="text-sm text-gray-500 ml-2">{phase === 'connecting' ? 'Connecting...' : 'Ringing...'}</Text>
              </View>
            )}

            {phase === 'connected' && (
              <Text className="text-sm text-emerald-600 font-medium">Connected · {formatDuration(duration)}</Text>
            )}

            {phase === 'ended' && (
              <Text className="text-sm text-gray-500">Call ended{duration > 0 ? ` · ${formatDuration(duration)}` : ''}</Text>
            )}

            {phase === 'failed' && !!error && (
              <Text className="text-sm text-red-600 text-center">{error}</Text>
            )}

            <View className="flex-row items-center gap-4 mt-5">
              {phase === 'connected' && (
                <TouchableOpacity
                  onPress={toggleMute}
                  className={`h-12 w-12 rounded-full items-center justify-center border ${muted ? 'bg-gray-200 border-gray-300' : 'bg-white border-gray-200'}`}
                >
                  {muted ? <MicOff size={18} color="#374151" /> : <Mic size={18} color="#374151" />}
                </TouchableOpacity>
              )}
              {(phase === 'connecting' || phase === 'ringing' || phase === 'connected') && (
                <TouchableOpacity onPress={endCall} className="h-12 w-12 rounded-full bg-red-600 items-center justify-center">
                  <PhoneOff size={20} color="#fff" />
                </TouchableOpacity>
              )}
              {phase === 'failed' && (
                <TouchableOpacity onPress={checkPermissionAndMaybeStart} className="flex-row items-center gap-2 px-4 py-2.5 bg-emerald-600 rounded-xl">
                  <PhoneCall size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white ml-2">Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
