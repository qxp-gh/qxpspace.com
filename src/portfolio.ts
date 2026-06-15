/**
 * portfolio.ts — entry for the /portfolio page.
 *
 * The page content (bio, project cards, experience, skills, contact) is static
 * HTML in portfolio/index.html — same convention as the homepage tiles, and it
 * keeps the work crawlable. This entry just boots the shared qxp experience
 * (audio + glitch + intro gate) and fills the footer glyph row.
 */

import { bootExperience, buildGlyphs, $ } from "./boot";

function init(): void {
  buildGlyphs($("footer-glyphs"));
  bootExperience({ coverSrc: "/cover.png", current: "portfolio" });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
