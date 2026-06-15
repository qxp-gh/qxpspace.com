/**
 * audio.ts — Web Audio engine for qxp space.
 *
 * Browsers block audio before a user gesture, so `unlock()` must be called
 * synchronously from inside the PRESS START click handler. It resumes the
 * AudioContext, starts playback (looping) and gently fades the music in to the
 * user's volume (default 45%).
 *
 * An AnalyserNode taps the signal so the visuals can react to the music:
 * bass drives glitch intensity, and the raw frequency/waveform data feeds the
 * footer/dock visualizer. The analyser sits *before* the gain node so the
 * visuals keep reacting even while muted or at low volume.
 */

export interface Bands {
  /** low end ~40–300 Hz, 0..1 */
  bass: number;
  /** mids ~300–1700 Hz, 0..1 */
  mid: number;
  /** highs ~1.7–7 kHz, 0..1 */
  treble: number;
  /** overall energy, 0..1 */
  level: number;
}

export interface AudioEngine {
  /**
   * Call inside a user gesture. Resumes context + starts looped music.
   * Pass `at` to start at a position (seconds) and `instant` to skip the fade-in
   * — used to resume seamlessly across a page hop.
   */
  unlock(opts?: { at?: number; instant?: boolean }): Promise<void>;
  /** Current playback position in seconds (for handing off across a page hop). */
  getCurrentTime(): number;
  /** Toggle mute (keeps the track playing so visuals stay reactive). Returns the new muted state. */
  toggleMute(): boolean;
  isMuted(): boolean;
  isPlaying(): boolean;
  /** True when real audio is flowing (drives the visualizer animation). */
  isLive(): boolean;
  /** Smoothed frequency bands for the current frame. Always returns sensible idle values. */
  getBands(): Bands;
  /** Current output volume, 0..1. */
  getVolume(): number;
  /** Set output volume (0..1). Persisted; applied live unless muted. */
  setVolume(v: number): void;
  /** Latest byte frequency data (length = frequencyBinCount), filled by getBands(). */
  getFreq(): Uint8Array | null;
  /** Latest byte time-domain (waveform) data (length = fftSize), filled by getBands(). */
  getTime(): Uint8Array | null;
}

const DEFAULT_VOLUME = 0.45;
const FADE_SECONDS = 2.6;
const STORAGE_KEY = "qxp:volume";

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return clamp01(n);
    }
  } catch {
    /* storage blocked — fall through to default */
  }
  return DEFAULT_VOLUME;
}

export function createAudioEngine(audioEl: HTMLAudioElement): AudioEngine {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let gain: GainNode | null = null;
  let freq: Uint8Array<ArrayBuffer> | null = null;
  let time: Uint8Array<ArrayBuffer> | null = null;
  let started = false;
  let unlocking = false;
  let muted = false;
  let live = false;
  let volume = loadVolume();

  // smoothed band values to avoid jitter
  const smoothed: Bands = { bass: 0, mid: 0, treble: 0, level: 0 };

  function buildGraph(): void {
    const AC = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!AC) return;

    ctx = new AC();
    const source = ctx.createMediaElementSource(audioEl);

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    freq = new Uint8Array(analyser.frequencyBinCount);
    time = new Uint8Array(analyser.fftSize);

    gain = ctx.createGain();
    gain.gain.value = 0;

    // source -> analyser -> gain -> out (analyser before gain => visuals survive mute)
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
  }

  async function unlock(opts?: { at?: number; instant?: boolean }): Promise<void> {
    if (started || unlocking) return;
    unlocking = true;

    if (!ctx) buildGraph();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* stays suspended — retried on the next gesture */
      }
    }

    audioEl.volume = 1; // output level is governed by the gain node
    try {
      audioEl.currentTime = opts?.at ?? 0;
      await audioEl.play();
      // latch ONLY on success, so an autoplay block (cross-page jump, Safari)
      // can be retried by a later user gesture instead of being stuck muted.
      started = true;
      if (ctx && gain) {
        const now = ctx.currentTime;
        const target = Math.max(0.0001, muted ? 0.0001 : volume);
        gain.gain.cancelScheduledValues(now);
        if (opts?.instant) {
          // resuming across a page hop — jump straight to volume, no fade-in
          gain.gain.setValueAtTime(target, now);
        } else {
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(target, now + FADE_SECONDS);
        }
      }
    } catch {
      // Autoplay still blocked — visuals fall back to idle motion; the boot
      // arms a one-shot gesture listener that calls unlock() again.
      audioEl.volume = muted ? 0 : volume;
    } finally {
      unlocking = false;
    }
  }

  function applyGain(target: number, ramp = 0.12): void {
    if (ctx && gain) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(Math.max(0.0001, target), now, ramp);
    } else {
      audioEl.volume = clamp01(target);
    }
  }

  function toggleMute(): boolean {
    muted = !muted;
    applyGain(muted ? 0.0001 : volume, 0.2);
    return muted;
  }

  function setVolume(v: number): void {
    volume = clamp01(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(volume));
    } catch {
      /* ignore */
    }
    if (!muted) applyGain(volume, 0.05);
  }

  const getVolume = (): number => volume;
  const getCurrentTime = (): number => audioEl.currentTime;
  const isMuted = (): boolean => muted;
  const isPlaying = (): boolean => started && !audioEl.paused;
  const isLive = (): boolean => live;
  const getFreq = (): Uint8Array | null => freq;
  const getTime = (): Uint8Array | null => time;

  function avg(from: number, to: number): number {
    if (!freq) return 0;
    let sum = 0;
    const lo = Math.max(0, from);
    const hi = Math.min(freq.length, to);
    for (let i = lo; i < hi; i++) sum += freq[i] ?? 0;
    return sum / Math.max(1, hi - lo) / 255;
  }

  const silent: Bands = { bass: 0, mid: 0, treble: 0, level: 0 };

  function getBands(): Bands {
    let target: Bands;

    if (started && analyser && freq && ctx && ctx.state === "running" && !audioEl.paused) {
      analyser.getByteFrequencyData(freq);
      if (time) analyser.getByteTimeDomainData(time);
      const bass = avg(1, 8);
      const mid = avg(8, 48);
      const treble = avg(48, 160);

      if (bass + mid + treble < 0.01) {
        live = false;
        target = silent;
      } else {
        live = true;
        target = { bass, mid, treble, level: Math.min(1, bass * 1.2 + mid * 0.9 + treble * 0.6) };
      }
    } else {
      live = false;
      target = silent;
    }

    smoothed.bass += (target.bass - smoothed.bass) * 0.35;
    smoothed.mid += (target.mid - smoothed.mid) * 0.3;
    smoothed.treble += (target.treble - smoothed.treble) * 0.4;
    smoothed.level += (target.level - smoothed.level) * 0.3;
    return smoothed;
  }

  return {
    unlock,
    toggleMute,
    isMuted,
    isPlaying,
    isLive,
    getBands,
    getVolume,
    getCurrentTime,
    setVolume,
    getFreq,
    getTime,
  };
}
