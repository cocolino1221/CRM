// A soft, warm two-note chime for new incoming messages. Uses the Web Audio
// API (sine waves + gentle envelope) so there's no external asset and nothing
// jarring — just a quiet "ding-dong".

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

export function playNewMessageChime(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    // Browsers suspend the context until a user gesture; resume best-effort.
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    // D5 then G5 — a mellow, friendly interval.
    const notes = [
      { freq: 587.33, start: 0, dur: 0.32 },
      { freq: 783.99, start: 0.11, dur: 0.42 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note.freq;

      const t0 = now + note.start;
      // Soft attack, gentle exponential decay → warm, not a harsh beep.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.12, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + note.dur + 0.05);
    }
  } catch {
    // Audio unavailable (autoplay policy, no device) — silently ignore.
  }
}
