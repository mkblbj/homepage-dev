/*
 * uoattendance — リング表示のビューモデル(純粋関数のみ)
 *
 * attendance-model.mjs の従業員(サーバ算出の attendance_status が正)を
 * 定稿デザインの 6 状態へ写像し、進捗リングの幾何を組み立てる。
 *
 *   in      出勤中・予定終了前   リング = 班次の経過(予定開始 → 予定終了)
 *                                弧がまだ無い(早出・打刻直後・予定外)ときも開始点を灯す
 *   over    出勤中・予定終了後   1 周目が満ちた上に 2 周目(残業分)を重ねる
 *   done    退勤済               閉じた灰色のリング(部門色を外して「もういない」を示す)
 *   up      未打刻・予定開始前   点線の薄い下地
 *   late    未打刻・予定開始後   点線の赤みの下地(N分遅れ)
 *   absent  未打刻・予定終了後   点線の赤みの下地(欠勤)
 *
 * 実線 = その場にいる(いた)人、点線 = まだ来ていない人。色の濃淡に頼らず、
 * 形だけで在・不在が分かるようにしている。
 *
 * 打刻は 1 人 1 件(出勤中なら IN、退勤済なら OUT)しか残らないので、進捗は
 * 打刻ではなく予定の時間帯で測る。予定の無い人(予定外の飛び込み・未設定)は
 * 進捗を持たず、リングは下地だけになる。
 *
 * 色はすべて CSS 変数(--ring-*)で参照する。ライト/ダークの値の出し分けは
 * コンポーネント側の責務。
 */

// 標準レイアウトで 1 部門がこの人数を超えたら、全部門そろって小さいリングに切り替える。
export const COMPACT_THRESHOLD = 7;

// column = そのリングを置く列の最小幅(下の名前・時刻が収まる幅)。
export const TILE_RINGS = {
  compact: { size: 54, stroke: 7, glow: 2, column: 58 },
  roomy: { size: 70, stroke: 9, glow: 3, column: 76 },
  large: { size: 88, stroke: 11, glow: 4, column: 100 },
};

// 横幅の内訳(px)。component.jsx のクラスと同じ値を持つ。
const LAYOUT = {
  twoColumn: 768, // これ未満は総覧が上に乗る   @3xl
  summary: 268, // 総覧の列   @3xl:grid-cols-[268px_…]
  gap: 18, // 総覧と部門の間   gap-[18px]
  panelGap: 10, // 部門パネル同士   gap-2.5
  panelPadding: 28, // パネルの左右   px-3.5 × 2
  tileGap: 6, // リングの列間
};

// 部門を横に並べたときの行数。2 行で左の総覧とほぼ同じ高さになる。
const SPLIT_ROWS = 2;

// 並べると列がこの倍率以上に間延びするなら並べない(人が少ない日は縦積みの方が締まる)。
const MAX_STRETCH = 3;

// 総覧の同心リング。hole = 中央の人数表示のために残す内径。
export const SUMMARY_RING = { size: 188, stroke: 18, gap: 4, hole: 64, glow: 5 };

// 予定が取れない日の「今日の経過」の既定枠(9:00–18:00)。
const DEFAULT_DAY = { start: 9 * 60, end: 18 * 60 };

// これ未満の進捗は弧を描かない(丸い先端だけが浮くのを防ぐ)。
const MIN_ARC = 0.004;

const RING = {
  start: "var(--ring-start)",
  head: "var(--ring-head)",
  track: "var(--ring-track)",
  lap: "var(--ring-lap)",
  closed: "var(--ring-closed)",
  idle: "var(--ring-idle)",
  alert: "var(--ring-alert)",
};

const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// "08:57" / "8:05" / "2026-07-06 08:57:16" → minutes since midnight
export function toMinutes(value) {
  if (value == null || value === "") {
    return null;
  }
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

// "9-18" / "09:00-18:00" / "13:00-18:00" → { start, end } in minutes
export function parseShiftSlot(text) {
  const match = String(text ?? "").match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }
  const [, startHour, startMinute = "0", endHour, endMinute = "0"] = match;
  const start = Number(startHour) * 60 + Number(startMinute);
  const end = Number(endHour) * 60 + Number(endMinute);
  return end > start ? { start, end } : null;
}

// Scheduled { start, end } from the richest source available; null when unknown.
export function scheduledSlot(employee) {
  let start = toMinutes(employee?.custom_start_time || employee?.start_time);
  let end = toMinutes(employee?.custom_end_time || employee?.end_time);
  if (start == null || end == null) {
    const parsed = parseShiftSlot(employee?.shiftText);
    start = start ?? parsed?.start ?? null;
    end = end ?? parsed?.end ?? null;
  }
  return start != null && end != null && end > start ? { start, end } : null;
}

// 08:05 (hours padded — a clock reading)
export function formatClock(minutes) {
  const value = Math.max(0, Math.floor(minutes));
  return `${pad2(Math.floor(value / 60))}:${pad2(value % 60)}`;
}

// 0:15 (hours unpadded — a length of time)
export function formatDuration(minutes) {
  const value = Math.max(0, Math.floor(minutes));
  return `${Math.floor(value / 60)}:${pad2(value % 60)}`;
}

function formatDelay(minutes) {
  const value = Math.max(0, Math.floor(minutes));
  if (value < 60) {
    return `${value}分遅れ`;
  }
  const rest = value % 60;
  return rest ? `${Math.floor(value / 60)}時間${rest}分遅れ` : `${value / 60}時間遅れ`;
}

export function tileState(employee, now) {
  const slot = scheduledSlot(employee);
  const status = employee?.attendance_status;

  if (status === "off_work") {
    return { key: "done", slot, progress: null };
  }
  if (status === "working") {
    if (!slot) {
      return { key: "in", slot, progress: null };
    }
    const progress = (now - slot.start) / (slot.end - slot.start);
    return { key: now >= slot.end ? "over" : "in", slot, progress };
  }
  if (slot && now >= slot.end) {
    return { key: "absent", slot, progress: null };
  }
  if (slot && now >= slot.start) {
    return { key: "late", slot, progress: null };
  }
  return { key: "up", slot, progress: null };
}

function statusText(key, slot, now, punch) {
  switch (key) {
    case "in":
      return slot ? `あと ${formatDuration(slot.end - now)}` : null;
    case "over":
      return `残業 +${formatDuration(now - slot.end)}`;
    case "done":
      return punch ? `退勤済 ${punch}` : "退勤済";
    case "late":
      return formatDelay(now - slot.start);
    case "absent":
      return "欠勤";
    default:
      return slot ? `${formatClock(slot.start)} から` : "未打刻";
  }
}

// Top-left corner of a round cap sitting on the ring's centre line at `fraction` of a turn.
function capAt(fraction, size, stroke) {
  const radius = size / 2 - stroke / 2;
  const angle = 2 * Math.PI * fraction;
  return {
    left: Number((size / 2 + radius * Math.sin(angle) - stroke / 2).toFixed(2)),
    top: Number((size / 2 - radius * Math.cos(angle) - stroke / 2).toFixed(2)),
  };
}

function arc(from, to, fraction) {
  // round away float noise (1.1 - 1 = 0.10000000000000009) before it lands in CSS
  const turn = Number(fraction.toFixed(4));
  return `conic-gradient(${from} 0turn, ${to} ${turn}turn, transparent ${turn}turn)`;
}

// The dashed track for people who are not here yet, drawn at half the stroke
// (thinTrack) so it reads as a light outline rather than a ring. A fixed dash count
// keeps the pattern in proportion on every ring size; one dash sits on twelve o'clock.
const DASHES = 16;
const DASH_SHARE = 0.55;

function dashed(color) {
  const period = 1 / DASHES;
  const dash = Number((period * DASH_SHARE).toFixed(4));
  return `repeating-conic-gradient(from ${-dash / 2}turn, ${color} 0turn ${dash}turn, transparent ${dash}turn ${period}turn)`;
}

/*
 * Layers, bottom to top: track → lap1 → startCap → lap2 → endCap.
 * lap1 is the shift so far (start → head); past 100% it closes into a full
 * circle and lap2 carries the overtime on top (head → lap), capped short of a
 * second full turn so the two laps never read as one.
 */
export function tileRing(key, progress, size, stroke) {
  const base = { track: RING.track, thinTrack: false, lap1: null, lap2: null, startCap: null, endCap: null };

  if (key === "done") {
    return { ...base, track: RING.closed };
  }
  if (key === "up") {
    return { ...base, track: dashed(RING.idle), thinTrack: true };
  }
  if (key === "late" || key === "absent") {
    return { ...base, track: dashed(RING.alert), thinTrack: true };
  }
  if (progress == null || progress < MIN_ARC) {
    // Punched in but no arc to draw yet (in early, just started, or a walk-in with no
    // shift): light the start point anyway, so the ring already reads as running.
    return { ...base, endCap: { ...capAt(0, size, stroke), color: RING.start } };
  }
  if (progress > 1) {
    const extra = clamp(progress - 1, 0.02, 0.97);
    return {
      ...base,
      lap1: `conic-gradient(${RING.start} 0turn, ${RING.head} 1turn)`,
      lap2: arc(RING.head, RING.lap, extra),
      startCap: { ...capAt(0, size, stroke), color: RING.head },
      endCap: { ...capAt(extra, size, stroke), color: RING.lap },
    };
  }
  return {
    ...base,
    lap1: arc(RING.start, RING.head, progress),
    startCap: { ...capAt(0, size, stroke), color: RING.start },
    endCap: { ...capAt(progress, size, stroke), color: RING.head },
  };
}

export function buildTile(employee, now, { ring = "roomy" } = {}) {
  const { key, slot, progress } = tileState(employee, now);
  const { size, stroke, glow } = TILE_RINGS[ring] ?? TILE_RINGS.roomy;
  const active = key === "in" || key === "over";
  // One punch per person: the IN time while working, the OUT time once off work.
  const punch = employee.displayTime || null;
  const status = statusText(key, slot, now, punch);
  const shift = slot ? `${formatClock(slot.start)}–${formatClock(slot.end)}` : employee.shiftText || null;
  const name = employee.employee_name || "";
  // The ring's centre is kept free for photos, so the percentage lives in the hover title.
  const progressText = active && progress != null ? `${Math.round(Math.max(0, progress) * 100)}%` : null;

  return {
    id: String(employee.employee ?? name),
    name,
    state: key,
    active,
    // name reads bright while the person is (or should be) here
    emphasized: active || key === "late",
    progressText,
    // under the name: the scheduled end; people without a slot show their shift text instead
    endLabel: slot ? formatClock(slot.end) : employee.shiftText || "",
    hasSlot: Boolean(slot),
    status,
    tooltip: [name, shift, progressText, status, active && punch ? `出勤 ${punch}` : null].filter(Boolean).join("　"),
    ring: { size, stroke, glow, ...tileRing(key, progress, size, stroke) },
    attendanceStatus: employee.attendance_status,
  };
}

/*
 * How the department panels share the width beside the summary.
 *
 *   standard  panels stacked, rings packed from the left (the design as drawn).
 *   split     panels side by side, each folded into SPLIT_ROWS rows. Panel widths
 *             follow their column counts, so every column comes out the same width
 *             and no row trails off into empty space. Rings grow to the largest
 *             size those columns still fit.
 *
 * width is the space the summary + panels grid gets (0/null when unmeasured);
 * counts are the people in each panel shown, in display order.
 */
export function planLayout(width, counts) {
  const standard = {
    split: false,
    ring: counts.some((count) => count > COMPACT_THRESHOLD) ? "compact" : "roomy",
    columns: null,
  };
  if (!width || width < LAYOUT.twoColumn || counts.length < 2) {
    return standard;
  }

  const columns = counts.map((count) => Math.max(1, Math.ceil(count / SPLIT_ROWS)));
  const total = columns.reduce((sum, value) => sum + value, 0);
  const fixed =
    LAYOUT.summary +
    LAYOUT.gap +
    (counts.length - 1) * LAYOUT.panelGap +
    counts.length * LAYOUT.panelPadding +
    (total - counts.length) * LAYOUT.tileGap;
  const columnWidth = (width - fixed) / total;
  const ring = ["large", "roomy"].find((size) => columnWidth >= TILE_RINGS[size].column);

  if (!ring || columnWidth > TILE_RINGS[ring].column * MAX_STRETCH) {
    return standard;
  }
  return { split: true, ring, columns };
}

// First shift start → last shift end of the day's roster (walk-ins don't widen it).
export function daySpan(employees) {
  let start = Infinity;
  let end = -Infinity;
  (employees || []).forEach((employee) => {
    const slot = scheduledSlot(employee);
    if (slot) {
      start = Math.min(start, slot.start);
      end = Math.max(end, slot.end);
    }
  });
  return start < end ? { start, end } : { ...DEFAULT_DAY };
}

export function dayProgress(slot, now) {
  return clamp((now - slot.start) / (slot.end - slot.start), 0, 1);
}

/*
 * Concentric summary rings, outermost first. The stroke thins only when more
 * rings than the design's three (two departments + the day) have to share the
 * radius around the centre count.
 */
export function summaryRings(entries) {
  const { size, gap, hole, glow } = SUMMARY_RING;
  const count = entries.length;
  const room = (size - hole) / 2 - (count - 1) * gap;
  const stroke = Math.min(SUMMARY_RING.stroke, room / Math.max(count, 1));

  return entries.map((entry, index) => {
    const offset = index * (stroke + gap);
    const ringSize = size - offset * 2;
    const progress = clamp(Number(entry.progress) || 0, 0, 1);
    const drawn = progress >= MIN_ARC;

    return {
      key: entry.key,
      offset,
      size: ringSize,
      stroke,
      glow,
      track: RING.track,
      lap1: drawn ? arc(RING.start, RING.head, progress) : null,
      lap2: null,
      startCap: drawn ? { ...capAt(0, ringSize, stroke), color: RING.start } : null,
      endCap: drawn ? { ...capAt(progress, ringSize, stroke), color: RING.head } : null,
    };
  });
}

// Who is on tomorrow's roster but not today's (added), and the reverse (removed).
export function diffRosters(todayEmployees, tomorrowEmployees) {
  const idOf = (employee) => String(employee?.employee ?? "");
  const uniqueById = (employees) => {
    const seen = new Set();
    return (employees || []).filter((employee) => {
      const id = idOf(employee);
      if (!id || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  };
  const today = uniqueById(todayEmployees);
  const tomorrow = uniqueById(tomorrowEmployees);
  const todayIds = new Set(today.map(idOf));
  const tomorrowIds = new Set(tomorrow.map(idOf));
  const pick = (employee) => ({ id: idOf(employee), name: employee.employee_name || idOf(employee) });

  return {
    added: tomorrow.filter((employee) => !todayIds.has(idOf(employee))).map(pick),
    removed: today.filter((employee) => !tomorrowIds.has(idOf(employee))).map(pick),
  };
}
