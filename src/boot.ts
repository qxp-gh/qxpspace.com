/**
 * boot.ts — the shared qxp experience shell + client-side soft-nav router.
 *
 * Runs ONCE per real document load. It owns the persistent layer that must
 * survive page switches — the Web Audio engine, the single-rAF glitch scene, the
 * audio dock and the intro gate — all of which live OUTSIDE #stage/#footer in the
 * markup. Switching pages is therefore a SOFT navigation: fetch the target HTML,
 * swap only #stage + #footer (+ <title>), and re-mount the page-specific bits.
 * The AudioContext never tears down, so music keeps playing seamlessly with NO
 * gate, NO flash and NO audio re-unlock. A fresh document load (deep link / first
 * visit) still shows the PRESS START gate once to unlock audio with a gesture.
 *
 * DOM contract (by id): #intro #press-start #boot-flash #audio #starfield #cover
 * #audio-dock #audio-toggle #volume #viz #stage #footer. #cover lives INSIDE
 * #stage on every page so it travels with a soft-nav swap (re-bound via
 * scene.setCover); on pages without a jewel case it is a hidden 0-size canvas.
 */

import "./style.css";
import { createAudioEngine, type Bands } from "./audio";
import { createGlitchScene } from "./glitch";
import { setupIntro, DESTINATIONS } from "./intro";
import { setupKickLiveStatus } from "./kick";

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

/* ---------- overscroll-up easter egg (homepage route only) ----------
 * Pulling up past the top fades the foreground to reveal the starfield. Returns
 * a cleanup that removes its window listeners — the router calls it when the
 * homepage route unmounts so a soft-nav away doesn't leak listeners. */
function setupOverscrollFade(root: HTMLElement): () => void {
  const TOP_EPS = 2;
  const MAX_OVERSCROLL = 600;
  let overscroll = 0;
  let touchY = 0;

  const apply = (): void => {
    root.style.setProperty("--reveal", String(1 - Math.min(1, overscroll / MAX_OVERSCROLL)));
  };

  const onWheel = (e: WheelEvent): void => {
    const atTop = window.scrollY <= TOP_EPS;
    if (e.deltaY < 0 && atTop) {
      overscroll = Math.min(MAX_OVERSCROLL, overscroll - e.deltaY);
      apply();
      e.preventDefault();
    } else if (overscroll > 0 && e.deltaY > 0) {
      overscroll = Math.max(0, overscroll - e.deltaY);
      apply();
      if (overscroll > 0) e.preventDefault();
    } else if (overscroll > 0 && !atTop) {
      overscroll = 0;
      apply();
    }
  };

  const onTouchStart = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (t) touchY = t.clientY;
  };

  const onTouchMove = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - touchY;
    touchY = t.clientY;
    const atTop = window.scrollY <= TOP_EPS;
    if (dy > 0 && atTop) {
      overscroll = Math.min(MAX_OVERSCROLL, overscroll + dy);
      apply();
    } else if (overscroll > 0 && dy < 0) {
      overscroll = Math.max(0, overscroll + dy);
      apply();
    }
  };

  const onScroll = (): void => {
    if (overscroll > 0 && window.scrollY > TOP_EPS) {
      overscroll = 0;
      apply();
    }
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("scroll", onScroll);
    root.style.setProperty("--reveal", "1");
  };
}

export interface BootOptions {
  /** Source for the glitch cover canvas. Defaults to /cover.png. */
  coverSrc?: string;
  /** id of the route this document loaded as (initial mount). */
  current?: string;
}

export function bootExperience(opts: BootOptions = {}): void {
  const audioEl = $<HTMLAudioElement>("audio");
  const starfield = $<HTMLCanvasElement>("starfield");
  const cover = $<HTMLCanvasElement>("cover");
  const audioDock = $("audio-dock");
  const audioToggle = $<HTMLButtonElement>("audio-toggle");
  const volumeEl = $<HTMLInputElement>("volume");
  const vizDock = $<HTMLCanvasElement>("viz");
  const root = document.documentElement;

  if (!audioEl || !starfield || !cover) return;

  const audio = createAudioEngine(audioEl);
  const visualizers = vizDock ? [vizDock] : [];

  /**
   * Push audio energy onto the document only as compositor-friendly CSS vars.
   * Quantized + written only on change, so a steady/silent signal costs nothing.
   */
  const STEPS = 50;
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
  scene.start(); // starfield runs behind the gate

  if (volumeEl) volumeEl.value = String(Math.round(audio.getVolume() * 100));

  const updateToggleUI = (muted: boolean): void => {
    if (!audioToggle) return;
    audioToggle.setAttribute("aria-pressed", String(muted));
    audioToggle.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    document.body.classList.toggle("audio-paused", muted || !audio.isPlaying());
    syncAudioReactive();
  };

  /* ---------------- per-route mount / unmount ---------------- */

  // Runs on first load AND after every soft-nav. Returns the cleanup the router
  // calls before mounting the next route (so homepage-only listeners/pollers
  // don't leak across switches). Idempotent bits (glyphs, year) just re-run.
  const mountRoute = (id: string): (() => void) => {
    const yearEl = $("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    buildGlyphs($("footer-glyphs"));
    const cov = $<HTMLCanvasElement>("cover");
    if (cov) scene.setCover(cov); // re-point the glitch render target at the new #cover

    const cleanups: Array<() => void> = [];
    if (id === "space") {
      buildGlyphs($("hero-glyphs"));
      cleanups.push(setupKickLiveStatus($("kick-tile")));
      cleanups.push(setupOverscrollFade(root));
    }
    return () => {
      for (const c of cleanups) c();
    };
  };

  let routeCleanup: () => void = () => {};
  let navigating = false;

  const pageId = (pathname: string): string | null => {
    let p = pathname.replace(/index\.html$/, "");
    if (p.length > 1 && !p.endsWith("/")) p += "/";
    const hit = DESTINATIONS.find((d) => d.path === p);
    return hit ? hit.id : null;
  };

  /* ---------------- soft navigation ---------------- */

  // Swap #stage + #footer + <title> in place — no document reload, so audio and
  // the glitch scene keep running. Falls back to a hard navigation on any failure.
  const navigate = async (rawPath: string, push: boolean): Promise<void> => {
    const url = new URL(rawPath, location.href);
    const id = url.origin === location.origin ? pageId(url.pathname) : null;
    if (!id) {
      window.location.href = rawPath; // external / unknown → real navigation
      return;
    }
    if (navigating) return;
    navigating = true;
    scene.boot(); // "disc swap" glitch burst (no reload)

    try {
      const res = await fetch(url.pathname, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const newStage = doc.getElementById("stage");
      const newFooter = doc.getElementById("footer");
      const curStage = $("stage");
      const curFooter = $("footer");
      if (!newStage || !curStage) throw new Error("no #stage");

      routeCleanup(); // tear down the outgoing route's listeners/pollers

      newStage.removeAttribute("aria-hidden");
      curStage.replaceWith(document.adoptNode(newStage));
      if (newFooter && curFooter) {
        newFooter.removeAttribute("aria-hidden");
        curFooter.replaceWith(document.adoptNode(newFooter));
      }
      document.title = doc.title;
      if (push) history.pushState({ spa: true }, "", url.pathname);
      window.scrollTo(0, 0);

      routeCleanup = mountRoute(id);
    } catch {
      window.location.href = url.pathname; // network/parse failure → hard nav
    } finally {
      navigating = false;
    }
  };

  // Intercept in-app disc links (page-top / footer / manifesto). Modifier- and
  // non-primary clicks fall through to a normal (new-tab) navigation.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest?.("a[data-disc-nav]") as HTMLAnchorElement | null;
    const href = link?.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    void navigate(href, true);
  });

  window.addEventListener("popstate", () => {
    void navigate(location.pathname, false);
  });

  // Robust audio-unlock net: once entered, the next real gesture (re)tries
  // unlock() until playback is confirmed, then self-removes. Backstop for a
  // PRESS START whose unlock didn't take (waits for `entered` so taps on the
  // gate's disc arrows don't start audio early). In the SPA, audio unlocks once
  // and never tears down, so this fires at most once per session.
  const GESTURES = ["touchend", "pointerup", "click", "keydown"];
  const detachNet = (): void => {
    for (const g of GESTURES) window.removeEventListener(g, tryUnlock);
  };
  function tryUnlock(): void {
    if (audio.isPlaying()) {
      detachNet();
      return;
    }
    if (!document.body.classList.contains("entered")) return;
    void audio.unlock().then(() => {
      if (audio.isPlaying()) detachNet();
    });
  }
  for (const g of GESTURES) window.addEventListener(g, tryUnlock, { passive: true });

  // mount the route this document loaded as (glyphs/kick/overscroll/cover)
  routeCleanup = mountRoute(opts.current ?? "space");

  // the PRESS START gate — shown only on a fresh document load
  setupIntro({
    current: opts.current ?? "space",
    onNavigate: (path) => void navigate(path, true),
    onStart: () => {
      void audio.unlock();
      scene.boot();
    },
    onBootComplete: () => {
      $("stage")?.removeAttribute("aria-hidden");
      $("footer")?.removeAttribute("aria-hidden");
      // dock must be un-hidden BEFORE resize(): sizeViz/sizeCover early-return on
      // a zero-width rect, so resizing while hidden leaves #viz 0-sized forever.
      if (audioDock) audioDock.hidden = false;
      scene.resize();
      updateToggleUI(audio.isMuted());
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
