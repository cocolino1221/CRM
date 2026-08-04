'use client';

import { useSyncExternalStore } from 'react';
import api from '@/lib/api';

// Global, app-wide WhatsApp call session — lives outside any single page's
// component tree so closing the call UI (minimize) doesn't tear down the
// call. Only one call can be active at a time. Mounted once via
// GlobalCallUI in the dashboard layout, so it's reachable from every page
// (WhatsApp, meta-inbox/Messenger, anywhere).

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

export interface CallManagerState {
  isOpen: boolean;
  waId: string | null;
  contactName: string;
  phase: CallPhase;
  error: string;
  duration: number;
  muted: boolean;
  isRecording: boolean;
  recordingDuration: number;
  callId: string | null;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const RECORDING_DISCLOSURE_TEXT = 'This call may be recorded for quality and training purposes.';

function pickRecorderMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

export function describeCallError(err: any): string {
  const name = err?.name || '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone found. Check that a microphone is connected, and that your browser has microphone access enabled at the OS level (e.g. on macOS: System Settings → Privacy & Security → Microphone).';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone access was blocked. Allow microphone access for this site in your browser settings and try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Could not access the microphone — it may be in use by another application.';
  }
  return err?.response?.data?.message || err?.message || 'Failed to start call';
}

const initialState: CallManagerState = {
  isOpen: false,
  waId: null,
  contactName: '',
  phase: 'checking_permission',
  error: '',
  duration: 0,
  muted: false,
  isRecording: false,
  recordingDuration: 0,
  callId: null,
};

class CallManager {
  private state: CallManagerState = { ...initialState };
  private listeners = new Set<() => void>();

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private eventSource: EventSource | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private durationValue = 0;
  private callId: string | null = null;
  private hasConnected = false;
  private finalized = false;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private recordingDurationValue = 0;
  /** Set once the user manually stops recording mid-call, so finalizeCall
   * doesn't need to (and can't) stop an already-stopped recorder again. */
  private manualRecordingUrl: string | undefined = undefined;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private setState(patch: Partial<CallManagerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** The audio element GlobalCallUI mounts once, persisting across minimize/maximize. */
  setAudioElement(el: HTMLAudioElement | null) {
    this.audioEl = el;
    if (el && this.remoteStream) {
      el.srcObject = this.remoteStream;
      void el.play().catch(() => {});
    }
  }

  /**
   * Starts a new call, or — if one's already active — just brings the UI
   * back (matches "press call again → reopen the active conversation").
   * Returns 'busy' if an active call for a DIFFERENT contact exists.
   */
  open(waId: string, contactName: string): 'started' | 'reopened' | 'busy' {
    if (this.state.waId) {
      if (this.state.waId === waId) {
        this.setState({ isOpen: true });
        return 'reopened';
      }
      this.setState({ isOpen: true });
      return 'busy';
    }
    this.setState({ ...initialState, isOpen: true, waId, contactName, phase: 'checking_permission' });
    void this.checkPermissionAndMaybeStart();
    return 'started';
  }

  minimize() {
    this.setState({ isOpen: false });
  }

  maximize() {
    if (this.state.waId) this.setState({ isOpen: true });
  }

  private async checkPermissionAndMaybeStart() {
    const waId = this.state.waId;
    if (!waId) return;
    this.setState({ phase: 'checking_permission', error: '' });
    try {
      const res = await api.get(`/integrations/whatsapp/calls/permission-status/${waId}`);
      if (res.data?.status === 'granted') {
        void this.startCall();
      } else {
        this.setState({ phase: 'needs_permission' });
      }
    } catch {
      void this.startCall();
    }
  }

  async requestPermission() {
    const waId = this.state.waId;
    if (!waId) return;
    this.setState({ error: '' });
    try {
      await api.post('/integrations/whatsapp/calls/permission-request', { waId });
      this.setState({ phase: 'permission_requested' });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to send permission request';
      if (/already/i.test(message)) {
        void this.startCall();
        return;
      }
      this.setState({ error: message });
    }
  }

  checkAgain() {
    void this.checkPermissionAndMaybeStart();
  }

  private openEventStream(onEvent: (payload: any) => void) {
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
    this.eventSource = source;
  }

  async startCall() {
    const waId = this.state.waId;
    if (!waId) return;
    this.setState({ phase: 'connecting', error: '' });
    this.hasConnected = false;
    this.finalized = false;
    this.manualRecordingUrl = undefined;
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.localStream = localStream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.pc = pc;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        if (this.audioEl) {
          this.audioEl.srcObject = event.streams[0];
          void this.audioEl.play().catch(() => {});
        }
      };

      this.openEventStream((payload) => {
        if (payload.type !== 'webhook' && payload.type !== 'initiated' && payload.type !== 'terminated') return;
        if (this.callId && payload.callId && payload.callId !== this.callId) return;

        if (payload.type === 'initiated' && payload.callId) {
          this.callId = payload.callId;
          this.setState({ callId: payload.callId });
        }

        if (payload.session?.sdp_type === 'answer' && payload.session?.sdp) {
          pc.setRemoteDescription({ type: 'answer', sdp: payload.session.sdp })
            .then(() => {
              this.hasConnected = true;
              this.setState({ phase: 'connected' });
              this.startDurationTimer();
            })
            .catch((err) => this.setState({ error: `Failed to establish call audio: ${err.message}` }));
        }

        if (payload.type === 'terminated' || payload.event === 'terminate' || payload.event === 'reject') {
          const status: CallStatus = this.hasConnected ? 'completed' : (payload.event === 'reject' ? 'rejected' : 'missed');
          void this.finalizeCall(status);
        }
      });

      // Non-trickle ICE: wait for gathering to finish so the offer carries
      // every candidate in one shot.
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

      let res: any;
      try {
        res = await api.post('/integrations/whatsapp/calls/initiate', { waId, sdpOffer: finalSdp });
      } catch (err: any) {
        const message = err.response?.data?.message || 'Failed to initiate call';
        if (/permission/i.test(message)) {
          this.setState({ error: message, phase: 'needs_permission' });
          this.cleanup();
          return;
        }
        throw err;
      }

      if (res.data?.callId) {
        this.callId = res.data.callId;
        this.setState({ callId: res.data.callId });
      }
      this.setState({ phase: 'ringing' });
    } catch (err: any) {
      this.setState({ error: describeCallError(err), phase: 'failed' });
      this.cleanup();
    }
  }

  private startDurationTimer() {
    this.durationValue = 0;
    this.setState({ duration: 0 });
    this.durationTimer = setInterval(() => {
      this.durationValue += 1;
      this.setState({ duration: this.durationValue });
    }, 1000);
  }

  /** Explicit user action (Record button) — not automatic. Sends the
   * required consent disclosure right as recording actually begins. */
  async toggleRecording() {
    if (this.state.phase !== 'connected') return;
    if (this.state.isRecording) {
      const url = await this.stopRecordingAndUpload();
      if (url) this.manualRecordingUrl = url;
      return;
    }
    const waId = this.state.waId;
    if (waId) {
      api.post('/integrations/whatsapp/send', { to: waId, message: RECORDING_DISCLOSURE_TEXT }).catch(() => {});
    }
    this.startRecording();
  }

  private startRecording() {
    try {
      const localStream = this.localStream;
      const remoteStream = this.remoteStream;
      if (!localStream || !remoteStream) return;
      const mimeType = pickRecorderMimeType();
      if (!mimeType) return;

      const audioContext = new AudioContext();
      this.audioContext = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(localStream).connect(destination);
      audioContext.createMediaStreamSource(remoteStream).connect(destination);

      this.recordedChunks = [];
      const recorder = new MediaRecorder(destination.stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
      recorder.start(1000);
      this.mediaRecorder = recorder;
      this.recordingDurationValue = 0;
      this.setState({ isRecording: true, recordingDuration: 0 });
      this.recordingTimer = setInterval(() => {
        this.recordingDurationValue += 1;
        this.setState({ recordingDuration: this.recordingDurationValue });
      }, 1000);
    } catch {
      // Recording is a nice-to-have on top of the call itself.
    }
  }

  private async stopRecordingAndUpload(): Promise<string | undefined> {
    const recorder = this.mediaRecorder;
    if (this.recordingTimer) clearInterval(this.recordingTimer);
    this.recordingTimer = null;
    this.setState({ isRecording: false, recordingDuration: 0 });
    if (!recorder || recorder.state === 'inactive') return undefined;

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => resolve(this.recordedChunks.length ? new Blob(this.recordedChunks, { type: recorder.mimeType }) : null);
      recorder.stop();
    });
    if (!blob || blob.size === 0) return undefined;

    try {
      const formData = new FormData();
      formData.append('file', blob, `call-${this.callId || Date.now()}.webm`);
      const res = await api.post('/integrations/whatsapp/calls/recording', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.url;
    } catch {
      return undefined;
    }
  }

  private async finalizeCall(status: CallStatus) {
    if (this.finalized) return;
    this.finalized = true;
    this.setState({ phase: 'ended' });

    const waId = this.state.waId;
    const finalDuration = this.durationValue;
    const recordingUrl = status === 'completed'
      ? (this.manualRecordingUrl || await this.stopRecordingAndUpload())
      : undefined;
    this.cleanup();

    const id = this.callId;
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

    // Leave the "ended" state visible briefly, then clear the active call
    // entirely so a fresh call can be started.
    setTimeout(() => {
      if (this.state.phase === 'ended') this.setState({ ...initialState });
    }, 2500);
  }

  toggleMute() {
    const stream = this.localStream;
    if (!stream) return;
    const nextMuted = !this.state.muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    this.setState({ muted: nextMuted });
  }

  async hangUp() {
    const status: CallStatus = this.hasConnected ? 'completed' : 'failed';
    const id = this.callId;
    if (id) {
      try {
        await api.post(`/integrations/whatsapp/calls/${id}/terminate`);
      } catch {
        // best-effort
      }
    }
    await this.finalizeCall(status);
  }

  retry() {
    void this.startCall();
  }

  private cleanup() {
    if (this.durationTimer) clearInterval(this.durationTimer);
    if (this.recordingTimer) clearInterval(this.recordingTimer);
    this.recordingTimer = null;
    this.eventSource?.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.audioContext?.close().catch(() => {});
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.eventSource = null;
    this.audioContext = null;
    this.mediaRecorder = null;
    if (this.audioEl) this.audioEl.srcObject = null;
  }
}

export const callManager = new CallManager();

export function useCallManager(): CallManagerState {
  return useSyncExternalStore(callManager.subscribe, callManager.getSnapshot, callManager.getSnapshot);
}
