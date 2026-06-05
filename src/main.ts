import "./style.css";
import { createAudioEngine } from "./audio";
import { createGlitchScene } from "./glitch";
import { setupIntro } from "./intro";
import { setupKickLiveStatus } from "./kick";

/* ---------- helpers ---------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function buildGlyphs(container: HTMLElement | null): void {
  if (!container) return;
  container.innerHTML = GLYPHS.map(
    (svg) => `<span class="glyph" aria-hidden="true">${svg}</span>`,
  ).join("");
}

/* ---------- overscroll-up easter egg ---------- */

/**
 * While the page is pinned at the very top, pulling further *up* fades the
 * foreground (#stage/#footer + FX overlays) toward invisible, uncovering the
 * starfield background animation. The starfield and the audio dock stay put.
 * Scrolling back down eases it back in. Normal scrolling is untouched: the fade
 * only engages at scrollTop ~0 with upward intent.
 */
function setupOverscrollFade(root: HTMLElement): void {
  const TOP_EPS = 2; // px treated as "at the top"
  const MAX_OVERSCROLL = 600; // px of accumulated overscroll → fully faded
  let overscroll = 0;

  const apply = (): void => {
    root.style.setProperty("--reveal", String(1 - Math.min(1, overscroll / MAX_OVERSCROLL)));
  };

  window.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      const atTop = window.scrollY <= TOP_EPS;
      if (e.deltaY < 0 && atTop) {
        overscroll = Math.min(MAX_OVERSCROLL, overscroll - e.deltaY);
        apply();
        e.preventDefault(); // hold the page while the fade builds
      } else if (overscroll > 0 && e.deltaY > 0) {
        overscroll = Math.max(0, overscroll - e.deltaY);
        apply();
        if (overscroll > 0) e.preventDefault(); // ease back in before the page moves
      } else if (overscroll > 0 && !atTop) {
        overscroll = 0;
        apply();
      }
    },
    { passive: false },
  );

  let touchY = 0;
  window.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) touchY = t.clientY;
    },
    { passive: true },
  );
  window.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - touchY; // dragging down (pulling the page down) is positive
      touchY = t.clientY;
      const atTop = window.scrollY <= TOP_EPS;
      if (dy > 0 && atTop) {
        overscroll = Math.min(MAX_OVERSCROLL, overscroll + dy);
        apply();
      } else if (overscroll > 0 && dy < 0) {
        overscroll = Math.max(0, overscroll + dy);
        apply();
      }
    },
    { passive: true },
  );

  // any real downward scroll away from the top snaps the reveal back to full
  window.addEventListener(
    "scroll",
    () => {
      if (overscroll > 0 && window.scrollY > TOP_EPS) {
        overscroll = 0;
        apply();
      }
    },
    { passive: true },
  );
}

/* ---------- boot ---------- */

function init(): void {
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
  buildGlyphs($("hero-glyphs"));
  buildGlyphs($("footer-glyphs"));
  setupKickLiveStatus($("kick-tile"));
  setupOverscrollFade(root);

  if (!audioEl || !starfield || !cover) return;

  const audio = createAudioEngine(audioEl);

  const visualizers = vizDock ? [vizDock] : [];

  const scene = createGlitchScene({
    starfield,
    cover,
    coverSrc: "/cover.png",
    getBands: () => audio.getBands(),
    reducedMotion,
    visualizers,
    getAudioData: () => ({ freq: audio.getFreq(), time: audio.getTime(), live: audio.isLive() }),
  });

  // starfield runs immediately so it lives behind the PRESS START gate
  scene.start();

  // reflect the persisted/default volume on the slider
  if (volumeEl) volumeEl.value = String(Math.round(audio.getVolume() * 100));

  const syncAudioReactive = (): void => {
    const bands = audio.getBands();
    const playing = audio.isPlaying() && audio.isLive();
    root.style.setProperty("--bass", String(bands.bass));
    root.style.setProperty("--mid", String(bands.mid));
    root.style.setProperty("--level", String(bands.level));
    root.style.setProperty("--glitch", String(playing ? Math.min(1, bands.level * 0.85) : 0));
    document.body.classList.toggle("audio-playing", playing);
  };

  const updateToggleUI = (muted: boolean): void => {
    if (!audioToggle) return;
    audioToggle.setAttribute("aria-pressed", String(muted));
    audioToggle.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    document.body.classList.toggle("audio-paused", muted || !audio.isPlaying());
    syncAudioReactive();
  };

  setupIntro({
    onStart: () => {
      void audio.unlock();
      scene.boot();
    },
    onBootComplete: () => {
      stage?.removeAttribute("aria-hidden");
      footer?.removeAttribute("aria-hidden");
      if (audioDock) audioDock.hidden = false;
      scene.resize(); // size the now-revealed dock visualizer
      updateToggleUI(audio.isMuted());
      const tick = (): void => {
        syncAudioReactive();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
