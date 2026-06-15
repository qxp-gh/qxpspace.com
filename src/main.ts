import { bootExperience, buildGlyphs, $ } from "./boot";
import { setupKickLiveStatus } from "./kick";

/* ---------- overscroll-up easter egg (homepage only) ---------- */

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
  buildGlyphs($("hero-glyphs"));
  buildGlyphs($("footer-glyphs"));
  setupKickLiveStatus($("kick-tile"));
  setupOverscrollFade(document.documentElement);

  bootExperience({ coverSrc: "/cover.png", current: "space" });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
