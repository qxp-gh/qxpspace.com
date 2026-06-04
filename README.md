# qxp space — `qxpspace.com`

An immersive single-page **personal digital dimension** for the **qxp** brand.
PlayStation jewel-case × psychedelic CRT/VHS glitch, an audio-reactive visualizer
wired to a 60-minute space-funk mix, and a PS-menu hub of links.

> Experience the Unknown. — `33.0°N · 110.1°W`

## The experience

- **PRESS START gate** — browsers block audio before a user gesture, so the site
  opens on a PlayStation-style splash. The click unlocks the `AudioContext`,
  starts the music (looped, gentle fade-in) and fires a glitch "boot" transition
  into the hero.
- **Glitch hero** — `WELCOME TO qxp space` with heavy RGB channel-split, the cover
  art rendered to a canvas with chromatic aberration + datamosh slice
  displacement, framed as a qxp jewel case (left `qxp space` spine replacing the
  PlayStation wordmark, coordinates, "Experience the Unknown", glyph icons).
- **Audio-reactive layer** — a Web Audio `AnalyserNode` feeds frequency bands into
  the visuals: **bass drives glitch intensity**, the reactive starfield streaks on
  hits, and CSS custom properties (`--bass`, `--level`, `--glitch`) drive flicker
  and the headline split.
- **Signals hub** — PlayStation-menu tiles: **YouTube** `@qxp_yt`, **Kick**
  `@qxp-kick` (with a pulsing LIVE indicator), **GitHub** `qxp-gh`.
- **Manifesto + footer** — a punchy qxp about, a "now playing" indicator, a credit
  link to the source mix, the four cover glyphs, and a mute/unmute toggle.
- **Mobile + a11y** — effects scale down on small screens, the layout reflows
  (tiles stack), and everything respects `prefers-reduced-motion`.

## Tech stack

- **Vite** + **TypeScript** (vanilla — no framework)
- **Tailwind CSS v4** (`@tailwindcss/vite`) + custom CSS for the CRT/glitch layers
- **Web Audio API** (`AnalyserNode`) for the reactive visualizer
- **Bun** as package manager / runtime
- **Docker + nginx** serving the static `dist/`

## Develop

```bash
bun install
bun run dev      # http://localhost:5173
```

## Build

```bash
bun run build    # type-checks (tsc) then builds to dist/
bun run preview  # preview the production build
```

## Assets

- `public/cover.png` — the jewel-case cover art (visual north star).
- `public/audio/playlist.mp3` — the soundtrack (~57 MB, committed so the Docker
  image serves it). Swap this file to change the music; the player + analyser
  pick it up automatically.

> The original source file `playlist.mp3` at the repo root is git-ignored — the
> served copy lives in `public/audio/`.

## Deploy (Docker / Coolify / Hetzner)

Multi-stage build (Bun → static `dist/` → nginx):

```bash
docker build -t qxpspace .
docker run --rm -p 8080:80 qxpspace   # http://localhost:8080
```

`nginx.conf` adds gzip, long-cache for hashed assets, range requests for the
audio, an SPA fallback and basic security headers. On Coolify, point a build pack
at this repo's `Dockerfile` and map port `80`.

## Credits

Source mix: [60 Minute Space Funk on YouTube](https://www.youtube.com/watch?v=Z0f1szlfFYk).
A **qxp** production · Experience the Unknown.
