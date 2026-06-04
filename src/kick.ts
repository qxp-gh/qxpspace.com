/**
 * kick.ts — Kick channel live status for the Signals tile.
 *
 * Uses Kick's internal v2 channel endpoint (same as kick.com). Fails closed:
 * on error or ambiguous response the LIVE badge stays hidden.
 */

const CHANNEL_SLUG = "qxp-kick";
/** Same-origin proxy (nginx / vite); falls back to Kick if proxy unavailable. */
const PROXY_URL = `/api/kick/channels/${CHANNEL_SLUG}`;
const DIRECT_URL = `https://kick.com/api/v2/channels/${CHANNEL_SLUG}`;
const POLL_MS = 60_000;

interface KickLivestream {
  is_live?: boolean;
}

interface KickChannelResponse {
  livestream?: KickLivestream | null;
}

function isChannelLive(payload: KickChannelResponse): boolean {
  if (payload && typeof payload === "object" && "error" in payload) return false;
  const ls = payload.livestream;
  if (!ls || typeof ls !== "object") return false;
  if (ls.is_live === false) return false;
  return ls.is_live === true || "id" in ls;
}

function applyLiveState(tile: HTMLElement, live: boolean): void {
  tile.classList.toggle("is-live", live);
  const badge = tile.querySelector<HTMLElement>(".live-badge");
  if (!badge) return;
  badge.hidden = !live;
  badge.setAttribute("aria-hidden", live ? "false" : "true");
  if (live) badge.setAttribute("aria-label", "Live now on Kick");
  else badge.removeAttribute("aria-label");
}

async function fetchFrom(url: string): Promise<boolean> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kick API ${res.status}`);
  const data = (await res.json()) as KickChannelResponse;
  return isChannelLive(data);
}

async function fetchLive(): Promise<boolean> {
  try {
    return await fetchFrom(PROXY_URL);
  } catch {
    try {
      return await fetchFrom(DIRECT_URL);
    } catch {
      return false;
    }
  }
}

/**
 * Poll Kick for live status and toggle `.is-live` on the Kick tile.
 * Safe to call when the tile is missing (no-op).
 */
export function setupKickLiveStatus(tile: HTMLElement | null): void {
  if (!tile) return;

  let timer: ReturnType<typeof setInterval> | undefined;

  const refresh = async (): Promise<void> => {
    try {
      applyLiveState(tile, await fetchLive());
    } catch {
      applyLiveState(tile, false);
    }
  };

  void refresh();
  timer = window.setInterval(() => void refresh(), POLL_MS);

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) void refresh();
    },
    { passive: true },
  );

  window.addEventListener("pagehide", () => {
    if (timer) clearInterval(timer);
  });
}
