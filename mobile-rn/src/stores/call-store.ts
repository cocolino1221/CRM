import { create } from 'zustand';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore — no bundled types for the RTC* constructors' generic shapes
import { RTCPeerConnection, mediaDevices } from 'react-native-webrtc';
import EventSource from 'react-native-sse';
import api, { API_BASE_URL } from '../lib/api';

// Global, app-wide call session — lives outside any single screen so
// backgrounding the call UI (closing the modal) doesn't tear down the call.
// Mirrors frontend/lib/call-manager.ts on web. Only one call at a time.

export type CallPhase =
  | 'checking_permission'
  | 'needs_permission'
  | 'permission_requested'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'ended'
  | 'failed';

type CallStatus = 'completed' | 'missed' | 'no_answer' | 'rejected' | 'failed';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// See web call-manager.ts for the same rationale — recording requires
// notifying the other party (GDPR + several US states require all-party
// consent). Sent only when recording is actually (manually) started.
const RECORDING_DISCLOSURE_TEXT = 'This call may be recorded for quality and training purposes.';

// NOTE: unlike web (full two-way mixed recording via the Web Audio API),
// this only captures the LOCAL mic — react-native-webrtc has no way to also
// capture the remote party's audio. Running expo-av's Audio.Recording
// alongside an active WebRTC call is UNTESTED on a real device (risk: the
// two competing for the same OS audio session). Guarded so any failure here
// never affects the call itself — worst case, no recording.

interface CallState {
  isOpen: boolean;
  waId: string | null;
  contactName: string;
  phase: CallPhase;
  error: string;
  duration: number;
  muted: boolean;
  isRecording: boolean;
  callId: string | null;

  open: (waId: string, contactName: string) => 'started' | 'reopened' | 'busy';
  minimize: () => void;
  maximize: () => void;
  requestPermission: () => Promise<void>;
  checkAgain: () => void;
  startCall: () => Promise<void>;
  toggleMute: () => void;
  toggleRecording: () => Promise<void>;
  hangUp: () => Promise<void>;
  retry: () => void;
}

// Non-serializable call internals live outside the store, same pattern as
// the web call-manager singleton.
let pc: any = null;
let localStream: any = null;
let eventSource: EventSource | null = null;
let durationTimer: ReturnType<typeof setInterval> | null = null;
let durationValue = 0;
let callId: string | null = null;
let hasConnected = false;
let finalized = false;
let recording: Audio.Recording | null = null;
let manualRecordingUrl: string | undefined;

function cleanup() {
  if (durationTimer) clearInterval(durationTimer);
  eventSource?.close();
  localStream?.getTracks().forEach((t: any) => t.stop());
  pc?.close();
  pc = null;
  localStream = null;
  eventSource = null;
  callId = null;
}

async function startRecording(): Promise<void> {
  try {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    recording = rec;
    useCallStore.setState({ isRecording: true });
  } catch {
    // Best-effort only — never let a recording failure affect the call.
    recording = null;
  }
}

async function stopRecordingAndUpload(): Promise<string | undefined> {
  useCallStore.setState({ isRecording: false });
  const rec = recording;
  recording = null;
  if (!rec) return undefined;
  try {
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    if (!uri) return undefined;
    const formData = new FormData();
    formData.append('file', { uri, type: 'audio/m4a', name: `call-${callId || Date.now()}.m4a` } as any);
    const res = await api.post('/integrations/whatsapp/calls/recording', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.url;
  } catch {
    return undefined;
  }
}

async function finalizeCall(status: CallStatus) {
  if (finalized) return;
  finalized = true;
  useCallStore.setState({ phase: 'ended' });
  const waId = useCallStore.getState().waId;
  const finalDuration = durationValue;
  const recordingUrl = status === 'completed'
    ? (manualRecordingUrl || await stopRecordingAndUpload())
    : undefined;
  cleanup();

  const id = callId;
  if (id && waId) {
    try {
      await api.post(`/integrations/whatsapp/calls/${id}/log`, {
        waId,
        status,
        durationSeconds: status === 'completed' ? finalDuration : undefined,
        recordingUrl,
      });
    } catch {
      // best-effort
    }
  }

  setTimeout(() => {
    if (useCallStore.getState().phase === 'ended') {
      useCallStore.setState({
        isOpen: false, waId: null, contactName: '', phase: 'checking_permission',
        error: '', duration: 0, muted: false, isRecording: false, callId: null,
      });
    }
  }, 2500);
}

export const useCallStore = create<CallState>((set, get) => ({
  isOpen: false,
  waId: null,
  contactName: '',
  phase: 'checking_permission',
  error: '',
  duration: 0,
  muted: false,
  isRecording: false,
  callId: null,

  open: (waId, contactName) => {
    const state = get();
    if (state.waId) {
      set({ isOpen: true });
      return state.waId === waId ? 'reopened' : 'busy';
    }
    finalized = false;
    hasConnected = false;
    manualRecordingUrl = undefined;
    set({
      isOpen: true, waId, contactName, phase: 'checking_permission',
      error: '', duration: 0, muted: false, isRecording: false, callId: null,
    });
    void checkPermissionAndMaybeStart();
    return 'started';
  },

  minimize: () => set({ isOpen: false }),
  maximize: () => { if (get().waId) set({ isOpen: true }); },

  requestPermission: async () => {
    const waId = get().waId;
    if (!waId) return;
    set({ error: '' });
    try {
      await api.post('/integrations/whatsapp/calls/permission-request', { waId });
      set({ phase: 'permission_requested' });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to send permission request';
      if (/already/i.test(message)) {
        void get().startCall();
        return;
      }
      set({ error: message });
    }
  },

  checkAgain: () => void checkPermissionAndMaybeStart(),

  startCall: async () => {
    const waId = get().waId;
    if (!waId) return;
    set({ phase: 'connecting', error: '' });
    hasConnected = false;
    finalized = false;
    try {
      const micPermission = await Audio.requestPermissionsAsync();
      if (!micPermission.granted) {
        throw new Error('Microphone permission is required to place a call');
      }

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStream = stream;

      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc = peer;
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));

      const token = await AsyncStorage.getItem('accessToken');
      const es = new EventSource(`${API_BASE_URL}/integrations/whatsapp/calls/stream`, {
        headers: token ? { Authorization: { toString: () => `Bearer ${token}` } as any } : undefined,
      });
      es.addEventListener('message', (event: any) => {
        let payload: any;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!payload || typeof payload !== 'object') return;
        if (payload.type !== 'webhook' && payload.type !== 'initiated' && payload.type !== 'terminated') return;
        if (callId && payload.callId && payload.callId !== callId) return;

        if (payload.type === 'initiated' && payload.callId) {
          callId = payload.callId;
          set({ callId: payload.callId });
        }

        if (payload.session?.sdp_type === 'answer' && payload.session?.sdp) {
          peer.setRemoteDescription({ type: 'answer', sdp: payload.session.sdp })
            .then(() => {
              hasConnected = true;
              set({ phase: 'connected' });
              durationValue = 0;
              set({ duration: 0 });
              durationTimer = setInterval(() => {
                durationValue += 1;
                set({ duration: durationValue });
              }, 1000);
            })
            .catch((err: any) => set({ error: `Failed to establish call audio: ${err.message}` }));
        }

        if (payload.type === 'terminated' || payload.event === 'terminate' || payload.event === 'reject') {
          const status: CallStatus = hasConnected ? 'completed' : (payload.event === 'reject' ? 'rejected' : 'missed');
          void finalizeCall(status);
        }
      });
      eventSource = es;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        peer.onicegatheringstatechange = () => {
          if (peer.iceGatheringState === 'complete') {
            peer.onicegatheringstatechange = null;
            resolve();
          }
        };
      });

      const finalSdp = peer.localDescription?.sdp;
      if (!finalSdp) throw new Error('Failed to generate call offer');

      let res: any;
      try {
        res = await api.post('/integrations/whatsapp/calls/initiate', { waId, sdpOffer: finalSdp });
      } catch (err: any) {
        const message = err.response?.data?.message || 'Failed to initiate call';
        if (/permission/i.test(message)) {
          set({ error: message, phase: 'needs_permission' });
          cleanup();
          return;
        }
        throw err;
      }

      if (res.data?.callId) {
        callId = res.data.callId;
        set({ callId: res.data.callId });
      }
      set({ phase: 'ringing' });
    } catch (err: any) {
      set({ error: err.response?.data?.message || err.message || 'Failed to start call', phase: 'failed' });
      cleanup();
    }
  },

  toggleMute: () => {
    if (!localStream) return;
    const nextMuted = !get().muted;
    localStream.getAudioTracks().forEach((track: any) => { track.enabled = !nextMuted; });
    set({ muted: nextMuted });
  },

  toggleRecording: async () => {
    if (get().phase !== 'connected') return;
    if (get().isRecording) {
      const url = await stopRecordingAndUpload();
      if (url) manualRecordingUrl = url;
      return;
    }
    const waId = get().waId;
    if (waId) {
      api.post('/integrations/whatsapp/send', { to: waId, message: RECORDING_DISCLOSURE_TEXT }).catch(() => {});
    }
    void startRecording();
  },

  hangUp: async () => {
    const status: CallStatus = hasConnected ? 'completed' : 'failed';
    const id = callId;
    if (id) {
      try {
        await api.post(`/integrations/whatsapp/calls/${id}/terminate`);
      } catch {
        // best-effort
      }
    }
    await finalizeCall(status);
  },

  retry: () => void useCallStore.getState().startCall(),
}));

async function checkPermissionAndMaybeStart() {
  const waId = useCallStore.getState().waId;
  if (!waId) return;
  useCallStore.setState({ phase: 'checking_permission', error: '' });
  try {
    const res = await api.get(`/integrations/whatsapp/calls/permission-status/${waId}`);
    if (res.data?.status === 'granted') {
      void useCallStore.getState().startCall();
    } else {
      useCallStore.setState({ phase: 'needs_permission' });
    }
  } catch {
    void useCallStore.getState().startCall();
  }
}
