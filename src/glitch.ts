/**
 * glitch.ts — audio-reactive canvas layer for qxp space.
 *
 *  - Reactive starfield (drifting depth field; bass adds speed + streaks).
 *  - Cover-art glitch: the jewel-case art is split into R/G/B channels which are
 *    offset every frame (chromatic aberration) with occasional datamosh-style
 *    horizontal slice displacement. Intensity is driven by bass.
 *  - Colorful spectrum visualizer (frequency bars + waveform) for the audio dock.
 *
 * Everything renders from a SINGLE requestAnimationFrame loop. The loop pauses
 * when the tab is hidden, the device-pixel-ratio is capped, the cover canvas is
 * resolution-limited, and off-screen visualizers are skipped — all to keep it
 * smooth on a typical laptop / phone. No per-frame CSS writes (avoids layout
 * thrash); reactivity lives entirely on the canvases.
 */

import type { Bands } from "./audio";

export interface GlitchScene {
  start(): void;
  stop(): void;
  /** Trigger a short, intense glitch burst (used for the boot transition). */
  boot(): void;
  /** Re-measure all canvases (call after layout changes, e.g. revealing the dock). */
  resize(): void;
}

interface Star {
  x: number;
  y: number;
  z: number;
  hue: number;
}

interface AudioData {
  freq: Uint8Array | null;
  time: Uint8Array | null;
  live: boolean;
}

interface VizEntry {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  visible: boolean;
  gradW: number;
  grad: CanvasGradient | null;
}

interface Options {
  starfield: HTMLCanvasElement;
  cover: HTMLCanvasElement;
  coverSrc: string;
  getBands: () => Bands;
  reducedMotion: boolean;
  visualizers?: HTMLCanvasElement[];
  getAudioData?: () => AudioData;
}

const STAR_COLORS = ["#00ff9c", "#00e0ff", "#b14dff", "#d6ff5c", "#ff2bd6"];

/** Fraction of the source art (from the left) occupied by the baked PlayStation spine. */
const CROP_LEFT = 0.14;
/** Device-pixel-ratio cap (perf): higher = sharper but heavier. */
const MAX_DPR = 1.5;
/** Hard cap on cover canvas backing width (perf). */
const MAX_COVER_W = 1100;

export function createGlitchScene(opts: Options): GlitchScene {
  const isMobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  // -------- starfield --------
  const sf = opts.starfield;
  const sfx = sf.getContext("2d");
  const starCount = opts.reducedMotion ? 80 : isMobile ? 110 : 240;
  let stars: Star[] = [];
  let sfW = 0;
  let sfH = 0;

  // -------- cover --------
  const cv = opts.cover;
  const cvx = cv.getContext("2d");
  const channels: HTMLCanvasElement[] = [];
  let coverReady = false;
  let imgW = 0;
  let imgH = 0;

  // -------- visualizers --------
  const vizEntries: VizEntry[] = (opts.visualizers ?? []).map((el) => ({
    el,
    ctx: el.getContext("2d"),
    visible: false,
    gradW: -1,
    grad: null,
  }));
  let vizObserver: IntersectionObserver | null = null;

  let raf = 0;
  let running = false;
  let burst = 0; // 0..1, decays over time

  /* ---------------- starfield ---------------- */

  function seedStars(): void {
    stars = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: Math.random(),
        hue: Math.floor(Math.random() * STAR_COLORS.length),
      });
    }
  }

  function sizeStarfield(): void {
    sfW = window.innerWidth;
    sfH = window.innerHeight;
    sf.width = Math.floor(sfW * dpr);
    sf.height = Math.floor(sfH * dpr);
    sf.style.width = `${sfW}px`;
    sf.style.height = `${sfH}px`;
    if (sfx) sfx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function renderStars(bands: Bands): void {
    if (!sfx) return;
    const speed = 0.0016 + bands.bass * 0.006 + burst * 0.02;
    const fade = 0.32 - bands.bass * 0.08 - burst * 0.1;
    sfx.fillStyle = `rgba(4, 6, 10, ${Math.max(0.08, fade)})`;
    sfx.fillRect(0, 0, sfW, sfH);

    const cxw = sfW / 2;
    const cyh = sfH / 2;
    const spread = Math.min(sfW, sfH) * 0.9;
    const energy = bands.bass + burst;

    for (const s of stars) {
      s.z -= speed;
      if (s.z <= 0.02) {
        s.x = (Math.random() - 0.5) * 2;
        s.y = (Math.random() - 0.5) * 2;
        s.z = 1;
        s.hue = Math.floor(Math.random() * STAR_COLORS.length);
      }
      const k = spread / s.z;
      const px = cxw + s.x * k;
      const py = cyh + s.y * k;
      if (px < 0 || px > sfW || py < 0 || py > sfH) continue;

      const size = Math.max(0.4, (1 - s.z) * 2.4);
      const color = STAR_COLORS[s.hue] ?? "#00ff9c";

      // streaks only when energetic AND for nearer stars (bounds stroke count)
      if (energy > 0.18 && s.z < 0.55) {
        const pz = spread / Math.min(1, s.z + speed * 4);
        sfx.globalAlpha = Math.min(1, (1 - s.z) * 1.2);
        sfx.lineWidth = size;
        sfx.strokeStyle = color;
        sfx.beginPath();
        sfx.moveTo(cxw + s.x * pz, cyh + s.y * pz);
        sfx.lineTo(px, py);
        sfx.stroke();
      } else {
        sfx.globalAlpha = Math.min(1, (1 - s.z) * 1.2);
        sfx.fillStyle = color;
        sfx.fillRect(px, py, size, size);
      }
    }
    sfx.globalAlpha = 1;
  }

  /* ---------------- cover ---------------- */

  function sizeCover(): void {
    const rect = cv.getBoundingClientRect();
    if (rect.width === 0) return;
    let useDpr = dpr;
    if (rect.width * useDpr > MAX_COVER_W) useDpr = MAX_COVER_W / rect.width;
    cv.width = Math.floor(rect.width * useDpr);
    cv.height = Math.floor(rect.height * useDpr);
  }

  function buildCover(img: HTMLImageElement): void {
    imgW = img.naturalWidth;
    imgH = img.naturalHeight;

    const base = document.createElement("canvas");
    base.width = imgW;
    base.height = imgH;
    const bctx = base.getContext("2d");
    if (!bctx) return;
    bctx.drawImage(img, 0, 0);

    let data: ImageData;
    try {
      data = bctx.getImageData(0, 0, imgW, imgH);
    } catch {
      channels.push(base);
      coverReady = true;
      return;
    }

    for (let c = 0; c < 3; c++) {
      const cnv = document.createElement("canvas");
      cnv.width = imgW;
      cnv.height = imgH;
      const cx = cnv.getContext("2d");
      if (!cx) continue;
      const out = cx.createImageData(imgW, imgH);
      for (let i = 0; i < data.data.length; i += 4) {
        out.data[i] = c === 0 ? (data.data[i] ?? 0) : 0;
        out.data[i + 1] = c === 1 ? (data.data[i + 1] ?? 0) : 0;
        out.data[i + 2] = c === 2 ? (data.data[i + 2] ?? 0) : 0;
        out.data[i + 3] = 255;
      }
      cx.putImageData(out, 0, 0);
      channels.push(cnv);
    }
    coverReady = true;
    sizeCover();
  }

  function renderCover(bands: Bands): void {
    if (!cvx || !coverReady) return;
    const w = cv.width;
    const h = cv.height;
    cvx.clearRect(0, 0, w, h);

    const srcX = imgW * CROP_LEFT;
    const srcW = imgW - srcX;
    const srcH = imgH;
    const scale = Math.max(w / srcW, h / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    const audioLive = opts.getAudioData?.().live ?? false;
    const intensity = audioLive ? Math.min(1, bands.bass * 0.95 + burst * 0.5) : burst * 0.35;
    const wob = audioLive ? Math.sin(performance.now() / 900) * 0.25 + 0.75 : 0;
    const unit = h / 420; // resolution-independent effect scale
    const off = audioLive
      ? (0.8 + intensity * 8 + burst * 14) * (0.65 + wob * 0.35) * unit
      : burst * 4 * unit;

    if (channels.length === 3) {
      cvx.globalCompositeOperation = "lighter";
      cvx.drawImage(channels[0]!, srcX, 0, srcW, srcH, dx - off, dy, dw, dh); // R left
      cvx.drawImage(channels[1]!, srcX, 0, srcW, srcH, dx, dy + off * 0.35, dw, dh); // G
      cvx.drawImage(channels[2]!, srcX, 0, srcW, srcH, dx + off, dy, dw, dh); // B right
      cvx.globalCompositeOperation = "source-over";
    } else if (channels.length === 1) {
      cvx.drawImage(channels[0]!, srcX, 0, srcW, srcH, dx, dy, dw, dh);
    }

    // datamosh slices — only when audio is live (or boot burst)
    const sliceChance = audioLive ? 0.02 + intensity * 0.28 + burst * 0.35 : burst * 0.25;
    if (Math.random() < sliceChance) {
      const slices = 1 + Math.floor((intensity + burst) * 3);
      for (let i = 0; i < slices; i++) {
        const sy = Math.random() * h;
        const sh = 3 * unit + Math.random() * 24 * unit;
        const shift = (Math.random() - 0.5) * (20 + intensity * 90 + burst * 120) * unit;
        try {
          cvx.drawImage(cv, 0, sy, w, sh, shift, sy, w, sh);
        } catch {
          /* ignore */
        }
        if (Math.random() < 0.5) {
          cvx.fillStyle = Math.random() < 0.5 ? "rgba(0,255,156,0.25)" : "rgba(255,43,214,0.22)";
          cvx.fillRect(0, sy, w, 1.5 * unit);
        }
      }
    }

    if (audioLive && intensity > 0.2) {
      cvx.globalCompositeOperation = "lighter";
      cvx.fillStyle = `rgba(0, 255, 156, ${intensity * 0.04})`;
      cvx.fillRect(0, 0, w, h);
      cvx.globalCompositeOperation = "source-over";
    }
  }

  /* ---------------- visualizers ---------------- */

  function setupVizObserver(): void {
    if (vizEntries.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      vizEntries.forEach((v) => (v.visible = true));
      return;
    }
    vizObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const ve = vizEntries.find((v) => v.el === e.target);
          if (ve) ve.visible = e.isIntersecting;
        }
      },
      { threshold: 0 },
    );
    vizEntries.forEach((v) => vizObserver!.observe(v.el));
  }

  function sizeViz(v: VizEntry): void {
    const r = v.el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    v.el.width = Math.floor(r.width * dpr);
    v.el.height = Math.floor(r.height * dpr);
    v.gradW = -1;
  }

  function vizGradient(v: VizEntry): CanvasGradient | null {
    if (!v.ctx) return null;
    if (v.grad && v.gradW === v.el.width) return v.grad;
    const g = v.ctx.createLinearGradient(0, 0, v.el.width, 0);
    g.addColorStop(0, "#00ff9c");
    g.addColorStop(0.34, "#00e0ff");
    g.addColorStop(0.67, "#b14dff");
    g.addColorStop(1, "#ff2bd6");
    v.grad = g;
    v.gradW = v.el.width;
    return g;
  }

  function drawViz(v: VizEntry, data: AudioData | undefined): void {
    const c = v.ctx;
    if (!c) return;
    const W = v.el.width;
    const H = v.el.height;
    const mid = H / 2;
    c.clearRect(0, 0, W, H);

    const freq = data?.freq;
    const time = data?.time;
    const liveNow = !!data?.live;

    if (!liveNow || !freq) {
      // idle: dim central baseline so it doesn't look broken when paused
      c.fillStyle = "rgba(0,255,156,0.20)";
      c.fillRect(0, mid - Math.max(1, H * 0.02), W, Math.max(1, H * 0.04));
      return;
    }

    const grad = vizGradient(v);
    const bars = Math.max(14, Math.min(64, Math.floor(W / 6)));
    const usable = Math.floor(freq.length * 0.62);
    const barW = W / bars;

    for (let i = 0; i < bars; i++) {
      const f0 = Math.floor(Math.pow(i / bars, 1.45) * usable);
      const f1 = Math.max(f0 + 1, Math.floor(Math.pow((i + 1) / bars, 1.45) * usable));
      let m = 0;
      for (let j = f0; j < f1 && j < freq.length; j++) {
        const val = freq[j] ?? 0;
        if (val > m) m = val;
      }
      const vv = m / 255;
      const bh = Math.max(1, vv * vv * mid * 1.7);
      const x = i * barW + 0.6;
      const bw = Math.max(1, barW - 1.3);

      if (grad) c.fillStyle = grad;
      c.fillRect(x, mid - bh, bw, bh); // upper
      c.fillRect(x, mid, bw, bh * 0.78); // mirrored lower
      // bright cap
      c.fillStyle = `rgba(255,255,255,${0.12 + vv * 0.5})`;
      c.fillRect(x, mid - bh, bw, Math.min(2, bh));
    }

    if (time) {
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = "rgba(150,245,255,0.5)";
      c.lineWidth = Math.max(1, H * 0.028);
      c.beginPath();
      const step = Math.max(1, Math.floor(time.length / W));
      let first = true;
      for (let x = 0, j = 0; x < W; x++, j += step) {
        const tv = ((time[j] ?? 128) - 128) / 128;
        const y = mid + tv * mid * 0.72;
        if (first) {
          c.moveTo(x, y);
          first = false;
        } else {
          c.lineTo(x, y);
        }
      }
      c.stroke();
      c.globalCompositeOperation = "source-over";
    }
  }

  function renderViz(data: AudioData | undefined): void {
    for (const v of vizEntries) {
      if (!v.ctx || !v.visible || v.el.width === 0) continue;
      drawViz(v, data);
    }
  }

  /* ---------------- loop ---------------- */

  function frame(): void {
    if (!running) return;
    const bands = opts.getBands(); // also refreshes audio freq/time buffers
    if (burst > 0) burst = Math.max(0, burst - 0.022);

    renderStars(bands);
    renderCover(bands);
    renderViz(opts.getAudioData?.());

    raf = requestAnimationFrame(frame);
  }

  function onResize(): void {
    resize();
  }

  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (running) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  }

  function resize(): void {
    sizeStarfield();
    sizeCover();
    vizEntries.forEach(sizeViz);
  }

  function start(): void {
    if (running) return;
    running = true;
    sizeStarfield();
    seedStars();
    sizeCover();
    vizEntries.forEach(sizeViz);
    setupVizObserver();
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    const img = new Image();
    img.decoding = "async";
    img.src = opts.coverSrc;
    if (img.complete && img.naturalWidth) {
      buildCover(img);
    } else {
      img.onload = () => buildCover(img);
    }

    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    vizObserver?.disconnect();
  }

  function boot(): void {
    burst = 1;
  }

  return { start, stop, boot, resize };
}
