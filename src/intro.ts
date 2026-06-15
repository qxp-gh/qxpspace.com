/**
 * intro.ts — the PRESS START gate, now a "disc selector".
 *
 * The gate is a small console boot menu: a carousel of destinations (discs)
 * flipped with the ◄ ► arrows, the dots, or the ←/→ keys. PRESS START boots
 * the highlighted disc:
 *   - if it's THIS page's disc → boot in place (audio unlocks inside the click);
 *   - if it's another page → flag + navigate; that page auto-boots on arrival.
 *
 * Audio still unlocks inside a user gesture for the in-place case. After a
 * cross-page jump the destination auto-boots (visuals immediately); audio
 * resumes on arrival where the browser allows, otherwise on the first gesture
 * (boot.ts arms that fallback).
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

export const AUTOSTART_KEY = "qxp:autostart";
const EXIT_MS = 700;

interface IntroHandlers {
  /** Runs synchronously inside the user gesture — unlock audio, fire the boot burst. */
  onStart: () => void;
  /** Runs after the splash has transitioned out. */
  onBootComplete: () => void;
  /** id of the destination THIS page represents (selected by default). */
  current: string;
  /** Switch to another disc's page — the host saves audio state, flags the
   *  autostart, plays the transition and navigates. */
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

  /** Boot the current page's experience in place (the original gate flow). */
  const bootInPlace = (): void => {
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
    }, EXIT_MS);

    window.setTimeout(() => body.classList.remove("glitch-burst"), 1100);
  };

  /** Commit the highlighted disc: boot in place, or jump to its page. */
  const enter = (): void => {
    if (committed) return;
    const dest = DESTINATIONS[index];

    if (dest && dest.id !== current) {
      // another disc → hand off to the host (saves audio position, sets the
      // autostart flag, plays the boot transition, then navigates)
      committed = true;
      onNavigate(dest.path);
      return;
    }

    bootInPlace();
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

  // Arrived via a disc pick on another page → boot this one immediately.
  let auto = false;
  try {
    auto = sessionStorage.getItem(AUTOSTART_KEY) === "1";
    if (auto) sessionStorage.removeItem(AUTOSTART_KEY);
  } catch {
    /* ignore */
  }
  if (auto) window.requestAnimationFrame(() => bootInPlace());
}
