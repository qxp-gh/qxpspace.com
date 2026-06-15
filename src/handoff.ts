/**
 * handoff.ts — single source of truth for the cross-page "disc swap" hand-off.
 *
 * When you switch pages WHILE THE MUSIC IS PLAYING, the departing page stashes a
 * single-use, short-TTL token in sessionStorage. The destination uses it to (a)
 * skip the gate with no flash and (b) resume the track at the same position.
 *
 * If audio is NOT playing we deliberately write nothing — the destination then
 * shows its PRESS START gate, which is the only way to get a valid user gesture
 * to start audio (required on iOS, where activation does not survive a
 * navigation). The TTL drops a stale token from an abandoned navigation so a
 * later manual load never auto-boots gesture-lessly.
 *
 * NOTE: the no-flash inline <head> script in index.html / portfolio/index.html
 * duplicates the KEY + TTL on purpose (it must run render-blocking before any
 * module loads). Keep them in sync.
 */

export const HANDOFF_KEY = "qxp:handoff";
export const HANDOFF_TTL_MS = 10_000;

export interface Handoff {
  /** playback position in seconds to resume at */
  at: number;
  muted: boolean;
  volume: number;
}

interface Stored extends Handoff {
  /** epoch ms when written, for the staleness check */
  t: number;
}

/** Departing page: stash the hand-off (call ONLY when audio is actually playing). */
export function markHandoff(h: Handoff): void {
  try {
    const stored: Stored = { ...h, t: Date.now() };
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(stored));
  } catch {
    /* storage blocked — destination just shows its gate */
  }
}

/** Read and CONSUME the hand-off (single use). Returns null if absent or stale. */
export function takeHandoff(): Handoff | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(HANDOFF_KEY);
    if (raw != null) sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    const s = JSON.parse(raw) as Stored;
    if (typeof s?.t !== "number" || Date.now() - s.t >= HANDOFF_TTL_MS) return null;
    return { at: s.at, muted: s.muted, volume: s.volume };
  } catch {
    return null;
  }
}
