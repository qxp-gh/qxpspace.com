/**
 * portfolio.ts — entry for the /portfolio route (deep link / first document load).
 *
 * The page content is static HTML; this just boots the shared shell + router as
 * the "portfolio" route. In-app switches between pages are soft navigations
 * handled by boot.ts (no reload).
 */

import { bootExperience } from "./boot";

function init(): void {
  bootExperience({ coverSrc: "/cover.png", current: "portfolio" });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
