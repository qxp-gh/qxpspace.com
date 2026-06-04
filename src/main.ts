import "./style.css";
import { createAudioEngine } from "./audio";
import { createGlitchScene } from "./glitch";
import { setupIntro } from "./intro";

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
  const vizFooter = $<HTMLCanvasElement>("viz-footer");
  const yearEl = $("year");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  buildGlyphs($("hero-glyphs"));
  buildGlyphs($("footer-glyphs"));

  if (!audioEl || !starfield || !cover) return;

  const audio = createAudioEngine(audioEl);

  const visualizers = [vizDock, vizFooter].filter(
    (c): c is HTMLCanvasElement => c != null,
  );

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

  const updateToggleUI = (muted: boolean): void => {
    if (!audioToggle) return;
    audioToggle.setAttribute("aria-pressed", String(muted));
    audioToggle.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    document.body.classList.toggle("audio-paused", muted);
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
      document.body.classList.toggle("audio-paused", !audio.isPlaying());
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
