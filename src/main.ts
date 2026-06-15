/**
 * main.ts — entry for the homepage route (deep link / first document load).
 *
 * All page-specific setup (glyphs, Kick poller, overscroll easter egg, cover)
 * now lives in boot.ts's per-route mount so it can re-run across soft-navs; this
 * entry just boots the shared shell + router as the "space" route.
 */

import { bootExperience } from "./boot";

function init(): void {
  bootExperience({ coverSrc: "/cover.png", current: "space" });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
