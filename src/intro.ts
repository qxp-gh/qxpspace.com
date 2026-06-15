/**
 * intro.ts — the PRESS START gate, now a "disc selector".
 *
 * The gate is a small console boot menu: a carousel of destinations (discs)
 * flipped with the ◄ ► arrows, the dots, or the ←/→ keys. PRESS START boots
 * the highlighted disc:
 *   - if it's THIS page's disc → boot in place;
 *   - if it's another page → unlock audio (in the gesture) then soft-nav to it.
 *
 * Audio always unlocks inside the PRESS START gesture. The gate only ever shows
 * on a fresh document load; in-app disc switches are soft navigations (no reload,
 * no gate), so audio simply keeps playing across them.
 */

export interface Destination {
  /** stable id, matches the `current` a page passes to bootExperience */
  id: string;
  /** big logo text (also used as the glitch data-text) */
  logo: string;
  /** sub-label under the logo */
  sub: string;
  /** where PRESS START sends you */
  path: string;
}

/** The discs, in carousel order. Add a page = add an entry here. */
export const DESTINATIONS: Destination[] = [
  { id: "space", logo: "qxp", sub: "PERSONAL DIGITAL DIMENSION", path: "/" },
  { id: "portfolio", logo: "JS", sub: "PORTFOLIO // CONTEXT ENGINEER", path: "/portfolio/" },
];

const EXIT_MS = 700;

interface IntroHandlers {
  /** Runs synchronously inside the user gesture — unlock audio, fire the boot burst. */
  onStart: () => void;
  /** Runs after the splash has transitioned out. */
  onBootComplete: () => void;
  /** id of the destination THIS page represents (selected by default). */
  current: string;
  /** Switch to another disc via the host's soft-nav router (no reload). */
  onNavigate: (path: string) => void;
}

export function setupIntro({ onStart, onBootComplete, current, onNavigate }: IntroHandlers): void {
  const intro = document.getElementById("intro");
  const button = document.getElementById("press-start");
  const flash = document.getElementById("boot-flash");
  const logo = document.getElementById("intro-logo");
  const sub = document.getElementById("intro-sub");
  const dotsWrap = document.getElementById("disc-dots");
  const prevBtn = document.querySelector<HTMLButtonElement>(".disc-arrow--prev");
  const nextBtn = document.querySelector<HTMLButtonElement>(".disc-arrow--next");
  const body = document.body;
  if (!intro || !button) return;

  const multi = DESTINATIONS.length > 1;
  let index = Math.max(
    0,
    DESTINATIONS.findIndex((d) => d.id === current),
  );
  let committed = false;

  // single destination → no carousel chrome
  if (!multi) {
    prevBtn?.setAttribute("hidden", "");
    nextBtn?.setAttribute("hidden", "");
    dotsWrap?.setAttribute("hidden", "");
  } else if (dotsWrap) {
    dotsWrap.innerHTML = DESTINATIONS.map(
      (d, i) =>
        `<button class="disc-dot" type="button" role="tab" data-i="${i}" aria-label="Select ${d.id}"></button>`,
    ).join("");
  }

  const render = (flick = false): void => {
    const d = DESTINATIONS[index];
    if (!d) return;
    if (logo) {
      logo.textContent = d.logo;
      logo.setAttribute("data-text", d.logo); // keep glitch ghost in sync
    }
    if (sub) sub.textContent = d.sub;
    if (dotsWrap) {
      dotsWrap.querySelectorAll(".disc-dot").forEach((el, i) => {
        el.classList.toggle("is-active", i === index);
        el.setAttribute("aria-selected", String(i === index));
      });
    }
    if (flick) {
      body.classList.add("disc-swap");
      window.setTimeout(() => body.classList.remove("disc-swap"), 260);
    }
  };

  const select = (i: number): void => {
    const n = DESTINATIONS.length;
    const next = ((i % n) + n) % n;
    if (next === index) return;
    index = next;
    render(true);
  };

  /** Reveal the experience (gate → out). `after` runs once revealed — used to
   *  soft-nav to another disc when one was picked at the gate. */
  const bootInPlace = (after?: () => void): void => {
    if (committed) return;
    committed = true;

    onStart();

    body.classList.add("glitch-burst");
    if (flash) {
      flash.style.transition = "none";
      flash.style.opacity = "0.85";
      requestAnimationFrame(() => {
        flash.style.transition = "opacity 0.5s ease";
        flash.style.opacity = "0";
      });
    }

    body.classList.add("entering");
    intro.setAttribute("aria-hidden", "true");

    window.setTimeout(() => {
      intro.style.display = "none";
      body.classList.remove("booting", "entering");
      body.classList.add("entered");
      onBootComplete();
      after?.();
    }, EXIT_MS);

    window.setTimeout(() => body.classList.remove("glitch-burst"), 1100);
  };

  /** Commit the highlighted disc: reveal this page, then soft-nav if it's another. */
  const enter = (): void => {
    if (committed) return;
    const dest = DESTINATIONS[index];
    const remote = !!dest && dest.id !== current;
    bootInPlace(remote && dest ? () => onNavigate(dest.path) : undefined);
  };

  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    select(index - 1);
  });
  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    select(index + 1);
  });
  dotsWrap?.addEventListener("click", (e) => {
    const dot = (e.target as HTMLElement).closest(".disc-dot");
    if (dot) {
      e.stopPropagation();
      select(Number(dot.getAttribute("data-i")));
    }
  });

  button.addEventListener("click", enter);

  intro.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      select(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      select(index + 1);
    } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      enter();
    }
  });

  render();
  window.requestAnimationFrame(() => button.focus());
}
