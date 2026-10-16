export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

// Desktop-wallpaper mode (/tv?desktop=1): the board sits inside margins so the Windows taskbar
// (bottom) and a column of desktop icons (left) do not cover it. Each margin can be tuned in
// the URL, e.g. /tv?desktop=1&left=200&bottom=48.
const DESKTOP_INSETS = { top: 0, right: 0, bottom: 56, left: 96 };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const MAX_INSET = 600;

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isOn(value) {
  return ["1", "true", "yes", "on"].includes(String(first(value) ?? "").toLowerCase());
}

function inset(value, fallback) {
  const raw = first(value);
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_INSET, Math.max(0, Math.round(n)));
}

export function parseDisplayOptions(query = {}) {
  const desktop = isOn(query.desktop);
  if (!desktop) {
    return { desktop: false, hideCursor: true, insets: { ...NO_INSETS } };
  }
  return {
    desktop: true,
    // A wallpaper must never swallow the desktop's pointer.
    hideCursor: false,
    insets: {
      top: inset(query.top, DESKTOP_INSETS.top),
      right: inset(query.right, DESKTOP_INSETS.right),
      bottom: inset(query.bottom, DESKTOP_INSETS.bottom),
      left: inset(query.left, DESKTOP_INSETS.left),
    },
  };
}

// Scale the 1920×1080 board into the viewport minus the margins, centred in what is left.
export function fitStage(viewWidth, viewHeight, insets = NO_INSETS) {
  const width = Math.max(1, viewWidth - insets.left - insets.right);
  const height = Math.max(1, viewHeight - insets.top - insets.bottom);
  const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  return {
    scale,
    left: insets.left + (width - STAGE_WIDTH * scale) / 2,
    top: insets.top + (height - STAGE_HEIGHT * scale) / 2,
  };
}
