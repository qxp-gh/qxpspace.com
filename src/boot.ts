/**
 * boot.ts — the shared qxp experience boot, used by BOTH the homepage
 * (src/main.ts) and the /portfolio page (src/portfolio.ts).
 *
 * Wires the Web Audio engine, the single-rAF glitch scene (starfield + cover +
 * dock visualizer) and the PRESS START intro gate together, and bridges audio
 * energy onto the document as compositor-only CSS vars. Pages add their own
 * page-specific bits (homepage: Kick status, overscroll easter egg; portfolio:
 * its static content) around this call.
 *
 * The DOM contract is by `id` — every page must ship the same FX/intro/dock/
 * audio markup ids (#intro #press-start #boot-flash #audio #starfield #cover
 * #audio-dock #audio-toggle #volume #viz), or the matching feature silently
 * no-ops. The `#cover` canvas may be hidden/zero-sized on pages without a jewel
 * case (renderCover then no-ops); it just must exist so glitch.ts has a canvas.
 */

import "./style.css";
import { createAudioEngine, type Bands } from "./audio";
import { createGlitchScene } from "./glitch";
import { setupIntro } from "./intro";
import { markHandoff, takeHandoff } from "./handoff";

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Small SVG glyphs echoing the four marks in the bottom-right of the cover art. */
const GLYPHS: string[] = [
  // mushroom
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 11a9 5 0 0 1 18 0Z"/><path d="M10 11v7a2 2 0 0 0 4 0v-7"/></svg>',
  // four-point sparkle
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10Z"/></svg>',
  // nested diamond
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 22 12 12 22 2 12Z"/><path d="M12 7 17 12 12 17 7 12Z"/></svg>',
  // ringed planet
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6"/><path d="M3 16c5 3 13 3 18-3" stroke-dasharray="2 2"/></svg>',
];

export function buildGlyphs(container: HTMLElement | null): void {
  if (!container) return;
  container.innerHTML = GLYPHS.map(
    (svg) => `<span class="glyph" aria-hidden="true">${svg}</span>`,
  ).join("");
}

export interface BootOptions {
  /** Source for the glitch cover canvas. Defaults to /cover.png. */
  coverSrc?: string;
  /** Runs after the intro boot transition completes (page chrome already revealed). */
  onReady?: () => void;
  /** id of the destination this page is (for the gate's disc selector). */
  current?: string;
}

/**
 * Boot the shared audio + glitch + intro experience. Idempotent-safe per page
 * load. Returns early (leaving the page static) only if the core FX markup is
 * missing — the same guard the homepage has always had.
 */
export function bootExperience(opts: BootOptions = {}): void {
  const audioEl = $<HTMLAudioElement>("audio");
  const starfield = $<HTMLCanvasElement>("starfield");
  const cover = $<HTMLCanvasElement>("cover");
  const stage = $("stage");
  const footer = $("footer");
  const audioDock = $("audio-dock");
  const audioToggle = $<HTMLButtonElement>("audio-toggle");
  const volumeEl = $<HTMLInputElement>("volume");
  const vizDock = $<HTMLCanvasElement>("viz");
  const yearEl = $("year");
  const root = document.documentElement;

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (!audioEl || !starfield || !cover) return;

  const audio = createAudioEngine(audioEl);

  // Arrived from an in-experience disc switch while music was playing? A single-use
  // hand-off token tells us to skip the gate (no flash) and resume the track at its
  // position. No token → first/normal load → the gate shows, which is required to
  // get a valid user gesture to start audio (mandatory on iOS).
  const handoff = takeHandoff();
  const resumeOpts = handoff ? { at: handoff.at, instant: true } : undefined;

  const visualizers = vizDock ? [vizDock] : [];

  /**
   * Push audio energy onto the document only as compositor-friendly CSS vars.
   * Values are quantized and written ONLY when the quantized step actually changes,
   * and the body class flips only on real state change — so a steady or silent
   * signal triggers zero style invalidation per frame. The vars drive opacity /
   * transform (GPU-composited) layers, never repaint-heavy paint properties.
   */
  const STEPS = 50; // 0..1 in ~0.02 increments
  const qstep = (v: number): number => Math.round(v * STEPS);
  let qBass = -1;
  let qLevel = -1;
  let qGlitch = -1;
  let wasPlaying: boolean | null = null;

  const syncAudioReactive = (bandsIn?: Bands): void => {
    const bands = bandsIn ?? audio.getBands();
    const playing = audio.isPlaying() && audio.isLive();

    const nBass = qstep(bands.bass);
    const nLevel = qstep(bands.level);
    const nGlitch = qstep(playing ? Math.min(1, bands.level * 0.85) : 0);

    if (nBass !== qBass) {
      qBass = nBass;
      root.style.setProperty("--bass", String(nBass / STEPS));
    }
    if (nLevel !== qLevel) {
      qLevel = nLevel;
      root.style.setProperty("--level", String(nLevel / STEPS));
    }
    if (nGlitch !== qGlitch) {
      qGlitch = nGlitch;
      root.style.setProperty("--glitch", String(nGlitch / STEPS));
    }
    if (playing !== wasPlaying) {
      wasPlaying = playing;
      document.body.classList.toggle("audio-playing", playing);
    }
  };

  const scene = createGlitchScene({
    starfield,
    cover,
    coverSrc: opts.coverSrc ?? "/cover.png",
    getBands: () => audio.getBands(),
    reducedMotion,
    visualizers,
    getAudioData: () => ({ freq: audio.getFreq(), time: audio.getTime(), live: audio.isLive() }),
    onFrame: syncAudioReactive,
  });

  // starfield runs immediately so it lives behind the PRESS START gate
  scene.start();

  // reflect the persisted/default volume on the slider
  if (volumeEl) volumeEl.value = String(Math.round(audio.getVolume() * 100));

  const updateToggleUI = (muted: boolean): void => {
    if (!audioToggle) return;
    audioToggle.setAttribute("aria-pressed", String(muted));
    audioToggle.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    document.body.classList.toggle("audio-paused", muted || !audio.isPlaying());
    syncAudioReactive();
  };

  /**
   * Switch to another disc's page. If music is playing, hand off (skip gate +
   * resume at position); otherwise write nothing so the destination shows its
   * gate (whose PRESS START is the valid gesture to start audio on iOS). Play the
   * "disc swap" burst, then navigate.
   */
  const goToPage = (path: string): void => {
    if (audio.isPlaying()) {
      markHandoff({ at: audio.getCurrentTime(), muted: audio.isMuted(), volume: audio.getVolume() });
    }
    document.body.classList.add("glitch-burst");
    const flash = $("boot-flash");
    if (flash) {
      flash.style.transition = "none";
      flash.style.opacity = "0.85";
    }
    scene.boot();
    window.setTimeout(() => {
      window.location.href = path;
    }, 220);
  };

  // In-experience disc navigation: page-top / footer / manifesto links carrying
  // data-disc-nav route through goToPage (seamless). Modifier-clicks fall through
  // to a normal new-tab navigation.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest?.("a[data-disc-nav]") as HTMLAnchorElement | null;
    const href = link?.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    goToPage(href);
  });

  // Robust audio-unlock safety net. Once the experience is entered, the next real
  // user gesture (re)tries unlock() until playback is CONFIRMED, then self-removes.
  // This is the only reliable iOS path after a gesture-less auto-boot (activation
  // doesn't survive a navigation) and a backstop if a PRESS START unlock fails.
  // It deliberately waits for `entered` so taps on the gate's disc arrows don't
  // start audio before PRESS START. touchend/pointerup/click cover iOS; keydown desktop.
  const GESTURES = ["touchend", "pointerup", "click", "keydown"];
  const detachNet = (): void => {
    for (const g of GESTURES) window.removeEventListener(g, tryUnlock);
  };
  function tryUnlock(): void {
    if (audio.isPlaying()) {
      detachNet();
      return;
    }
    if (!document.body.classList.contains("entered")) return; // gate still up
    void audio.unlock(resumeOpts).then(() => {
      if (audio.isPlaying()) detachNet();
    });
  }
  for (const g of GESTURES) window.addEventListener(g, tryUnlock, { passive: true });

  setupIntro({
    current: opts.current ?? "space",
    autostart: handoff != null,
    onNavigate: goToPage,
    onStart: () => {
      void audio.unlock(resumeOpts);
      scene.boot();
    },
    onBootComplete: () => {
      stage?.removeAttribute("aria-hidden");
      footer?.removeAttribute("aria-hidden");
      // dock must be un-hidden BEFORE resize(): sizeViz/sizeCover early-return on
      // a zero-width rect, so resizing while hidden leaves #viz 0-sized forever.
      if (audioDock) audioDock.hidden = false;
      scene.resize(); // size the now-revealed dock visualizer
      // carry the mute state across a disc hop
      if (handoff?.muted && !audio.isMuted()) audio.toggleMute();
      updateToggleUI(audio.isMuted());
      opts.onReady?.();
      // per-frame reactivity rides the scene's single rAF loop via onFrame; audio
      // (re)starts via the gesture net above if it didn't auto-start (iOS).
    },
  });

  audioToggle?.addEventListener("click", () => {
    updateToggleUI(audio.toggleMute());
  });

  volumeEl?.addEventListener("input", () => {
    const v = Number(volumeEl.value) / 100;
    audio.setVolume(v);
    // dragging the volume up un-mutes (familiar player behaviour)
    if (v > 0 && audio.isMuted()) updateToggleUI(audio.toggleMute());
  });
}
