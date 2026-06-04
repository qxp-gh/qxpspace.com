/**
 * intro.ts — the PRESS START / ENTER THE SPACE audio gate.
 *
 * The first interaction is the user gesture that unlocks audio. `onStart` runs
 * *synchronously* inside that gesture (so AudioContext.resume()/play() are
 * allowed), then a glitch "boot" transition wipes the splash away and
 * `onBootComplete` reveals the experience.
 */

interface IntroHandlers {
  /** Runs synchronously inside the user gesture — unlock audio, fire the boot burst. */
  onStart: () => void;
  /** Runs after the splash has transitioned out. */
  onBootComplete: () => void;
}

const EXIT_MS = 700;

export function setupIntro({ onStart, onBootComplete }: IntroHandlers): void {
  const intro = document.getElementById("intro");
  const button = document.getElementById("press-start");
  const flash = document.getElementById("boot-flash");
  const body = document.body;
  if (!intro || !button) return;

  let entered = false;

  const enter = (): void => {
    if (entered) return;
    entered = true;

    // 1) inside the gesture: unlock audio + kick the glitch burst
    onStart();

    // 2) boot flash + hard glitch
    body.classList.add("glitch-burst");
    if (flash) {
      flash.style.transition = "none";
      flash.style.opacity = "0.85";
      requestAnimationFrame(() => {
        flash.style.transition = "opacity 0.5s ease";
        flash.style.opacity = "0";
      });
    }

    // 3) wipe the splash
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

  button.addEventListener("click", enter);

  // Pressing Enter / Space anywhere on the gate also starts it.
  intro.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      enter();
    }
  });

  // Focus the button so keyboard users land on the gesture target.
  window.requestAnimationFrame(() => button.focus());
}
