import Container from "components/services/widget/container";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { buildTodayAttendanceModel, buildTomorrowScheduleModel, formatScheduledFte } from "./attendance-model.mjs";
import {
  buildTile,
  dayProgress,
  daySpan,
  diffRosters,
  formatClock,
  parseShiftSlot,
  planLayout,
  summaryRings,
  TILE_RINGS,
} from "./ring-model.mjs";
import { getNextTakadaManualStatus, isTakadaEmployee } from "./takada-manual-status.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";

/*
 * uoattendance — リング表示(定稿)
 *
 * データ層は attendance-model.mjs(サーバ算出の attendance_status が正)、
 * 状態の判定とリングの幾何は ring-model.mjs。ここは見た目だけを持つ。
 *
 *   左   総覧: 部門ごとの出勤率 + 今日の経過を同心リングで、中央に出勤人数。
 *   右   部門パネル: 1 人 1 リング = 予定の班次に対する経過。下に予定の退勤時刻。
 *        どの部門も 7 人以下なら大きいリング、超えたら全部門そろって小さいリング。
 *        リングの中央は顔写真(名前・数字は置かない)。予定前の人は写真を淡く。
 *        退勤すると灰色の閉じたリングになり、写真を暗く沈めてチェックを重ねる。
 *        どの状態でも位置は動かない。
 *        進捗率・残り時間・実際の打刻時刻はホバーの title に入れる。
 *   下   明日: 人数・内訳・今日との入れ替わり(名前つき)。詳細で班次別の一覧。
 *
 * 色は半透明の白/黒の重ねと部門色だけで組み、ダッシュボードのテーマ色には
 * 依存しない。部門色は CSS 変数で渡し、ライト/ダークの値は下のクラスで選ぶ。
 */

// 部門色。dark はデザインの値そのまま。light は明るい面の上で進捗の先端
// (head)が埋もれないよう、先端を濃い側に倒している。ink は文字色で、
// light は明るい面に対して WCAG AA(4.5:1)を満たす濃さ。
const PALETTES = {
  Office: {
    dark: {
      start: "#2E9BFF",
      head: "#8FE0FF",
      track: "rgba(46,155,255,0.24)",
      lap: "#E3F8FF",
      ink: "#8FE0FF",
    },
    light: {
      start: "#2E9BFF",
      head: "#0F5FC2",
      track: "rgba(46,155,255,0.18)",
      lap: "#0A3A7A",
      ink: "#1A6591",
    },
  },
  Production: {
    dark: {
      start: "#FF6A2B",
      head: "#FFC56E",
      track: "rgba(255,106,43,0.24)",
      lap: "#FFF1D2",
      ink: "#FFC56E",
    },
    light: {
      start: "#FF6A2B",
      head: "#C2410C",
      track: "rgba(255,106,43,0.18)",
      lap: "#7C2D12",
      ink: "#8F5A0B",
    },
  },
};
const FALLBACK_PALETTE = {
  dark: {
    start: "#8A94A0",
    head: "#D5DCE3",
    track: "rgba(138,148,160,0.26)",
    lap: "#F1F4F7",
    ink: "#D5DCE3",
  },
  light: {
    start: "#8A94A0",
    head: "#4B5563",
    track: "rgba(138,148,160,0.22)",
    lap: "#1F2937",
    ink: "#525C66",
  },
};
const DAY_PALETTE = {
  dark: {
    start: "#8C6BFF",
    head: "#D9CCFF",
    track: "rgba(140,107,255,0.26)",
    lap: "#D9CCFF",
    ink: "#D9CCFF",
  },
  light: {
    start: "#8C6BFF",
    head: "#5B3CC4",
    track: "rgba(140,107,255,0.2)",
    lap: "#5B3CC4",
    ink: "#5B3CC4",
  },
};

function paletteFor(key) {
  return PALETTES[key] || FALLBACK_PALETTE;
}

const PALETTE_KEYS = ["start", "head", "track", "lap", "ink"];

// Both themes' values ride along as --x-l / --x-d; PALETTE_SWITCH picks one into --x.
function paletteStyle(palette) {
  const style = {};
  PALETTE_KEYS.forEach((key) => {
    const name = key === "ink" ? "--ink" : `--ring-${key}`;
    style[`${name}-l`] = palette.light[key];
    style[`${name}-d`] = palette.dark[key];
  });
  return style;
}

// Written out in full so Tailwind can find every class in the source.
const PALETTE_SWITCH = [
  "[--ring-start:var(--ring-start-l)] dark:[--ring-start:var(--ring-start-d)]",
  "[--ring-head:var(--ring-head-l)] dark:[--ring-head:var(--ring-head-d)]",
  "[--ring-track:var(--ring-track-l)] dark:[--ring-track:var(--ring-track-d)]",
  "[--ring-lap:var(--ring-lap-l)] dark:[--ring-lap:var(--ring-lap-d)]",
  "[--ink:var(--ink-l)] dark:[--ink:var(--ink-d)]",
].join(" ");

// Department-independent ring colors: not-yet-started track, closed ring once off work,
// late/absent track, and the head's shadow.
const RING_BASE_VARS = [
  "[--ring-idle:rgba(15,23,42,0.1)] dark:[--ring-idle:rgba(255,255,255,0.14)]",
  "[--ring-closed:rgba(15,23,42,0.2)] dark:[--ring-closed:rgba(255,255,255,0.26)]",
  "[--ring-alert:rgba(220,70,50,0.3)] dark:[--ring-alert:rgba(255,142,126,0.38)]",
  "[--ring-shadow:rgba(0,0,0,0.3)] dark:[--ring-shadow:rgba(0,0,0,0.5)]",
].join(" ");

const TEXT_SOFT = "text-neutral-700 dark:text-white/80";
const TEXT_MUTED = "text-neutral-600 dark:text-white/70";
const SUMMARY_SURFACE = "bg-white/45 dark:bg-black/[0.34]";
const PANEL_SURFACE = "bg-white/40 dark:bg-black/[0.26]";

// 明日の「+N」に名前を並べる上限。超えた分は「ほかN名」。
const MAX_ADDED_NAMES = 4;

function formatShortDate(dateString) {
  if (!dateString) {
    return null;
  }
  const [, month, day] = dateString.split("-");
  if (!month || !day) {
    return dateString;
  }
  return `${Number(month)}/${Number(day)}`;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];
function weekdayJp(dateString) {
  if (!dateString) {
    return "";
  }
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : WEEKDAY_JP[date.getDay()];
}

function formatDay(dateString) {
  const short = formatShortDate(dateString);
  const weekday = weekdayJp(dateString);
  return short ? `${short}${weekday ? ` (${weekday})` : ""}` : null;
}

function resolvePhotoUrl(image, baseUrl) {
  if (typeof image !== "string" || !image.startsWith("/files/") || !baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    const url = new URL(image, base);
    return url.origin === base.origin && url.pathname.startsWith("/files/") ? url.href : null;
  } catch {
    return null;
  }
}

// Live clock, re-read on every minute boundary so the header time never lags.
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const schedule = () => {
      const current = new Date();
      const untilNextMinute = 60000 - (current.getSeconds() * 1000 + current.getMilliseconds());
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, untilNextMinute + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

// Width of the element behind the returned callback ref, kept current on resize.
// A callback ref (not useRef) so it still attaches when the element mounts late,
// after the loading skeleton. Measured before paint so the layout never flashes.
function useWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!node) {
      return undefined;
    }
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

// ---- icons ----
function RefreshIcon({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" />
    </svg>
  );
}

function CheckIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

// ---- ring: conic-gradient layers masked to a band, plus round caps at both ends ----
// children sit on top, over the ring's open centre: the photo, and the check once someone has left.
function Ring({ ring, children }) {
  const { size, stroke, glow } = ring;
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke - 0.5}px))`;
  const band = (background) => (
    <span aria-hidden="true" className="absolute inset-0 rounded-full" style={{ background, mask, WebkitMask: mask }} />
  );
  const cap = (point, shadow) =>
    point ? (
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          left: point.left,
          top: point.top,
          width: stroke,
          height: stroke,
          background: point.color,
          boxShadow: shadow ? `0 0 ${glow}px 1px var(--ring-shadow)` : undefined,
        }}
      />
    ) : null;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {band(ring.track)}
      {ring.lap1 ? band(ring.lap1) : null}
      {cap(ring.startCap, false)}
      {ring.lap2 ? band(ring.lap2) : null}
      {cap(ring.endCap, true)}
      {children}
    </div>
  );
}

// ---- roster calendar: month view per department, opened from its panel header ----
const CALENDAR_TITLES = {
  Office: "オフィスシフトカレンダー（今月）",
  Production: "生産シフトカレンダー（今月）",
};

function RosterCalendarLink({ department, children = "シフト表" }) {
  const title = CALENDAR_TITLES[department];

  return (
    <a
      href={`/api/uoroster/calendar?department=${department}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-lg border border-black/10 px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-white/85 dark:hover:bg-white/10"
    >
      <CalendarIcon className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

// ---- summary: concentric rings + legend ----
function SummaryPanel({ rings, present, total, legend }) {
  return (
    <div
      role="group"
      aria-label="今日の概要"
      className={`flex flex-col items-center justify-center gap-4 rounded-[22px] px-5 pb-[18px] pt-[22px] @md:flex-row @md:gap-6 @3xl:flex-col @3xl:gap-4 ${SUMMARY_SURFACE}`}
    >
      <div className="relative h-[188px] w-[188px] shrink-0">
        {rings.map((ring) => (
          <div
            key={ring.key}
            className={`absolute ${PALETTE_SWITCH}`}
            style={{ left: ring.offset, top: ring.offset, ...paletteStyle(ring.palette) }}
          >
            <Ring ring={ring} />
          </div>
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-extrabold leading-none tabular-nums">{present}</span>
          <span className={`mt-0.5 text-[10.5px] font-extrabold leading-none tabular-nums ${TEXT_MUTED}`}>
            /{total}
          </span>
        </div>
      </div>
      <div className="flex w-full max-w-[280px] flex-col gap-2 @3xl:max-w-none">
        {legend.map((row) => (
          <div
            key={row.key}
            className={`flex items-baseline gap-2 whitespace-nowrap text-[12.5px] ${PALETTE_SWITCH}`}
            style={paletteStyle(row.palette)}
          >
            <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: "var(--ring-start)" }} />
            {row.label}
            {row.note ? <span className={`text-[11px] ${TEXT_MUTED}`}>{row.note}</span> : null}
            <b className="ml-auto text-[20px] font-extrabold leading-none tabular-nums text-[color:var(--ink)]">
              {row.value}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

// Photo by state: gone → sunk dark under the check; not in yet → faded; everyone else as is.
const PHOTO_STATE_STYLE = {
  done: { filter: "grayscale(0.6) brightness(0.45)" },
  up: { opacity: 0.6 },
};

// ---- one person: ring + name + scheduled end ----
function Tile({ tile, ring, onTakadaManualToggle }) {
  const compact = ring === "compact";
  const done = tile.state === "done";
  const [failedPhotoUrl, setFailedPhotoUrl] = useState(null);
  const showPhoto = Boolean(tile.photoUrl && tile.photoUrl !== failedPhotoUrl);
  const nameClass = `block min-w-0 max-w-full truncate ${compact ? "text-[11.5px]" : "text-[12px]"} ${
    tile.emphasized ? "text-neutral-900 dark:text-white" : TEXT_SOFT
  }`;

  return (
    <div title={tile.tooltip} className={`flex min-w-0 flex-col items-center ${compact ? "gap-1" : "gap-[5px]"}`}>
      <Ring ring={tile.ring}>
        {showPhoto ? (
          <img
            src={tile.photoUrl}
            alt=""
            loading="lazy"
            onError={() => setFailedPhotoUrl(tile.photoUrl)}
            className="absolute rounded-full object-cover transition-[filter,opacity] duration-500 motion-reduce:transition-none"
            style={{
              top: tile.ring.stroke + 2,
              left: tile.ring.stroke + 2,
              width: tile.ring.size - 2 * tile.ring.stroke - 4,
              height: tile.ring.size - 2 * tile.ring.stroke - 4,
              ...PHOTO_STATE_STYLE[tile.state],
            }}
          />
        ) : null}
        {done ? (
          // White over the darkened photo; with no photo behind it, the muted text colour.
          <span
            aria-hidden="true"
            className={`absolute inset-0 grid place-items-center ${showPhoto ? "text-white/90" : TEXT_MUTED}`}
          >
            <CheckIcon size={Math.round(tile.ring.size * 0.34)} />
          </span>
        ) : null}
      </Ring>

      {tile.canManualToggle ? (
        <button
          type="button"
          className={`${nameClass} cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 transition-colors hover:text-amber-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-amber-400`}
          title="表示打刻を切り替え"
          aria-label={`${tile.name}の表示打刻を切り替え`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTakadaManualToggle(tile);
          }}
        >
          {tile.name}
        </button>
      ) : (
        <span className={nameClass}>{tile.name}</span>
      )}

      {done ? (
        <span
          className={`whitespace-nowrap font-medium ${compact ? "text-[11.5px] leading-[13px]" : "text-[12px] leading-[14px]"} ${TEXT_SOFT}`}
        >
          退勤済
        </span>
      ) : tile.hasSlot ? (
        <span
          className={`whitespace-nowrap font-extrabold leading-none tabular-nums text-[color:var(--ink)] ${
            compact ? "text-[13px]" : "text-[14px]"
          }`}
        >
          {tile.endLabel}
        </span>
      ) : (
        <span className={`whitespace-nowrap text-[10.5px] font-bold leading-[14px] ${TEXT_MUTED}`}>
          {tile.endLabel}
        </span>
      )}
      {tile.progressText || tile.status ? (
        <span className="sr-only">{[tile.progressText, tile.status].filter(Boolean).join("　")}</span>
      ) : null}
    </div>
  );
}

// ---- department panel ----
// columns: a fixed column count while the panels sit side by side; null packs rings from the left.
function DeptPanel({ group, ring, columns, showCalendar, onTakadaManualToggle }) {
  const split = columns != null;
  return (
    <div
      role="group"
      aria-label={group.label}
      className={`flex min-w-0 flex-col rounded-[22px] px-3.5 pb-3.5 pt-3 ${split ? "" : "flex-auto"} ${PANEL_SURFACE} ${PALETTE_SWITCH}`}
      style={{
        ...paletteStyle(group.palette),
        // Padding + column gaps as the basis, the rest shared by column count:
        // every column across the side-by-side panels ends up the same width.
        ...(split ? { flex: `${columns} 1 ${28 + (columns - 1) * 6}px` } : null),
      }}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
        <span className="text-[12px] font-bold">{group.label}</span>
        <span className="text-[13px] font-extrabold leading-none tabular-nums text-[color:var(--ink)]">
          {group.working}/{group.total}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {group.done > 0 ? (
            <span className={`text-[11px] font-medium ${TEXT_SOFT}`}>退勤済 {group.done}名</span>
          ) : null}
          {showCalendar ? <RosterCalendarLink department={group.key} /> : null}
        </span>
      </div>
      <div
        className={`grid ${split ? "my-auto" : ""}`}
        style={{
          gridTemplateColumns: split
            ? `repeat(${columns}, minmax(0, 1fr))`
            : `repeat(auto-fill, minmax(${TILE_RINGS[ring].column}px, 1fr))`,
          gap: ring === "compact" ? "12px 6px" : "14px 6px",
        }}
      >
        {group.tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} ring={ring} onTakadaManualToggle={onTakadaManualToggle} />
        ))}
      </div>
    </div>
  );
}

// ---- tomorrow: one line + expandable per-shift detail ----
function TomorrowFooter({ model, error, loading }) {
  const [open, setOpen] = useState(false);
  const added = model.diff?.added ?? [];
  const removed = model.diff?.removed ?? [];
  const shownAdded = added.slice(0, MAX_ADDED_NAMES);
  const day = formatDay(model.date);
  const breakdown = [
    ...model.groups.map((group) => `${group.label} ${group.count}`),
    model.fteText ? `換算 ${model.fteText}人` : null,
  ].filter(Boolean);

  return (
    <section
      aria-label="明日の予定"
      className="mt-4 flex flex-col gap-3 border-t border-black/10 pt-3.5 dark:border-white/15"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="whitespace-nowrap text-[13px] font-bold">明日{day ? ` ${day}` : ""}</span>
        {error ? (
          <span className={`text-[12px] ${TEXT_MUTED}`}>取得できませんでした</span>
        ) : loading ? (
          <span className="h-4 w-28 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        ) : (
          <>
            <span className="whitespace-nowrap">
              <b className="text-[18px] font-extrabold tabular-nums">{model.count}</b>
              <span className="text-[12px]">名</span>
            </span>
            {breakdown.length > 0 ? (
              <span className={`whitespace-nowrap text-[12px] tabular-nums ${TEXT_SOFT}`}>{breakdown.join(" · ")}</span>
            ) : null}
            {added.length > 0 ? (
              <span className="flex flex-wrap items-center gap-1.5" title="今日比：明日から加わる人">
                <b className="text-[13px] font-extrabold tabular-nums text-emerald-700 dark:text-[#9DF2CC]">
                  +{added.length}
                </b>
                {shownAdded.map((person) => (
                  <span
                    key={person.id}
                    className="whitespace-nowrap rounded-[10px] bg-emerald-500/15 px-2 py-0.5 text-[12px] dark:bg-[rgba(111,227,176,0.16)]"
                  >
                    {person.name}
                  </span>
                ))}
                {added.length > shownAdded.length ? (
                  <span className={`whitespace-nowrap text-[12px] ${TEXT_SOFT}`}>
                    ほか{added.length - shownAdded.length}名
                  </span>
                ) : null}
              </span>
            ) : null}
            {removed.length > 0 ? (
              <span className="flex items-center gap-1.5" title="今日比：明日は休みの人">
                <b className="text-[13px] font-extrabold tabular-nums">−{removed.length}</b>
                <span className={`whitespace-nowrap text-[12px] ${TEXT_SOFT}`}>
                  {removed[0].name}
                  {removed.length > 1 ? ` ほか${removed.length - 1}名` : ""}
                </span>
              </span>
            ) : null}
            {model.groups.length > 0 ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen((value) => !value);
                }}
                className="ml-auto inline-flex h-6 items-center rounded-full border border-black/10 px-2.5 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10"
              >
                {open ? "閉じる" : "詳細"}
              </button>
            ) : null}
          </>
        )}
      </div>

      {open && !error && model.groups.length > 0 ? (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {model.groups.map((group) => (
            <div key={group.key} className={`flex flex-col gap-1.5 rounded-2xl px-3.5 py-2.5 ${PANEL_SURFACE}`}>
              <span className="text-[11.5px] font-bold">
                {group.label} <span className="tabular-nums">{group.count}</span>
                {group.fteText ? <span className={`font-medium ${TEXT_MUTED}`}> · 換算 {group.fteText}人</span> : null}
              </span>
              <div className="grid items-baseline gap-x-2.5 gap-y-1" style={{ gridTemplateColumns: "auto 1fr" }}>
                {group.slots.map((slot) => (
                  <div key={slot.label} className="contents">
                    <span className="rounded-md bg-black/5 px-1.5 py-px text-center text-[10px] font-bold tabular-nums text-neutral-700 dark:bg-white/10 dark:text-white/80">
                      {slot.label}
                    </span>
                    <span className="text-[12px] text-neutral-800 dark:text-white/90">{slot.names.join(" ・ ")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LoadingSkeleton() {
  const bone = "animate-pulse bg-black/10 dark:bg-white/10";
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-3.5 px-2.5 pb-2.5 pt-1">
      <div className="flex items-center gap-3">
        <div className={`h-5 w-24 rounded ${bone}`} />
        <div className={`ml-auto h-6 w-28 rounded-full ${bone}`} />
      </div>
      <div className="grid gap-[18px] @3xl:grid-cols-[268px_minmax(0,1fr)]">
        <div className={`flex items-center justify-center rounded-[22px] p-6 ${SUMMARY_SURFACE}`}>
          <div className="h-[188px] w-[188px] animate-pulse rounded-full border-[18px] border-black/10 dark:border-white/10" />
        </div>
        <div className="flex flex-col gap-2.5">
          {[0, 1].map((panel) => (
            <div key={panel} className={`flex flex-col gap-3 rounded-[22px] p-3.5 ${PANEL_SURFACE}`}>
              <div className={`h-3 w-20 rounded ${bone}`} />
              <div className="flex flex-wrap gap-3">
                {[0, 1, 2, 3, 4].map((tile) => (
                  <div
                    key={tile}
                    className="h-[70px] w-[70px] animate-pulse rounded-full border-[9px] border-black/10 dark:border-white/10"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildTomorrowView(tomorrowModel, todaySnapshot, tomorrowSnapshot) {
  const groups = (tomorrowModel.groups || []).map((group) => {
    const slotMap = new Map();
    group.employees.forEach((employee) => {
      const label = employee.shiftText || "-";
      if (!slotMap.has(label)) {
        slotMap.set(label, []);
      }
      slotMap.get(label).push(employee.employee_name);
    });
    const slots = [...slotMap.entries()]
      .map(([label, names]) => ({ label, names, start: parseShiftSlot(label)?.start ?? 0 }))
      .sort((a, b) => a.start - b.start);

    return {
      key: group.key,
      label: group.label,
      count: group.count,
      fteText: group.key === "Production" ? formatScheduledFte(group.scheduledFte) : null,
      slots,
    };
  });

  // Only compare rosters when both days actually have one to compare.
  const todayRoster = todaySnapshot?.employees || [];
  const diff =
    Array.isArray(todaySnapshot?.employees) && Array.isArray(tomorrowSnapshot?.employees)
      ? diffRosters(todayRoster, tomorrowSnapshot.employees)
      : null;

  return {
    date: tomorrowModel.date,
    count: tomorrowModel.count,
    groups,
    diff,
    fteText: groups.find((group) => group.key === "Production")?.fteText ?? null,
  };
}

export default function Component({ service }) {
  const { widget } = service;
  const [refreshKey, setRefreshKey] = useState(0);
  const [spin, setSpin] = useState(0);
  const [takadaManualStatus, setTakadaManualStatus] = useState(null);
  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const refreshInterval = Math.max(1000, widget.refreshInterval || 3600000);

  const {
    data: actualData,
    error: actualError,
    mutate: mutateActual,
  } = useWidgetAPI(widget, "actual", {
    refreshKey,
    refreshInterval,
  });

  const {
    data: todayScheduleData,
    error: todayScheduleError,
    mutate: mutateTodaySchedule,
  } = useWidgetAPI(widget, widget.scheduleUrl ? "schedule" : "", {
    day: "today",
    refreshKey,
    refreshInterval,
  });

  const {
    data: tomorrowScheduleData,
    error: tomorrowScheduleError,
    mutate: mutateTomorrowSchedule,
  } = useWidgetAPI(widget, widget.scheduleUrl ? "schedule" : "", {
    day: "tomorrow",
    refreshKey,
    refreshInterval,
  });

  const actualEmployees = useMemo(() => actualData?.message?.employees || [], [actualData]);

  useEffect(() => {
    let cancelled = false;

    async function loadTakadaManualStatus() {
      try {
        const response = await fetch("/api/uoattendance/takada");
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!cancelled) {
          setTakadaManualStatus(payload?.status || null);
        }
      } catch (e) {
        // The widget still works from HRMS data if local display state is unavailable.
      }
    }

    loadTakadaManualStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const todaySnapshot = useMemo(
    () => todayScheduleData?.message?.today ?? todayScheduleData?.message ?? null,
    [todayScheduleData],
  );
  const tomorrowSnapshot = useMemo(
    () => tomorrowScheduleData?.message?.tomorrow ?? tomorrowScheduleData?.message ?? null,
    [tomorrowScheduleData],
  );

  const todayModel = useMemo(
    () => buildTodayAttendanceModel({ todaySnapshot, actualEmployees, takadaManualStatus }),
    [todaySnapshot, actualEmployees, takadaManualStatus],
  );
  const tomorrowModel = useMemo(() => buildTomorrowScheduleModel(tomorrowSnapshot), [tomorrowSnapshot]);

  // Panel arrangement and ring size follow the width the grid actually gets.
  const [gridRef, gridWidth] = useWidth();
  const panelCounts = useMemo(
    () => todayModel.groups.map((group) => group.employees.length).filter((count) => count > 0),
    [todayModel],
  );
  const plan = useMemo(() => planLayout(gridWidth, panelCounts), [gridWidth, panelCounts]);

  const view = useMemo(() => {
    const photoBaseUrl = widget.photoBaseUrl || widget.scheduleUrl;
    const actualPhotos = new Map(
      actualEmployees
        .filter((employee) => employee.employee && employee.image)
        .map((employee) => [String(employee.employee), employee.image]),
    );
    const groups = todayModel.groups.map((group) => {
      const tiles = group.employees.map((employee) => ({
        ...buildTile(employee, nowMinutes, { ring: plan.ring }),
        photoUrl:
          resolvePhotoUrl(employee.image, photoBaseUrl) ||
          resolvePhotoUrl(actualPhotos.get(String(employee.employee)), photoBaseUrl),
        canManualToggle: isTakadaEmployee(employee),
      }));
      return {
        key: group.key,
        label: group.label,
        palette: paletteFor(group.key),
        tiles,
        working: tiles.filter((tile) => tile.active).length,
        done: tiles.filter((tile) => tile.state === "done").length,
        total: group.totalCount ?? group.count ?? tiles.length,
        fteText: group.key === "Production" ? formatScheduledFte(group.scheduledFte) : null,
      };
    });

    const present = groups.reduce((sum, group) => sum + group.working, 0);
    const total = groups.reduce((sum, group) => sum + group.total, 0);
    const day = dayProgress(daySpan(todayModel.groups.flatMap((group) => group.employees)), nowMinutes);

    const rings = summaryRings([
      ...groups.map((group) => ({ key: group.key, progress: group.total > 0 ? group.working / group.total : 0 })),
      { key: "day", progress: day },
    ]).map((ring, index) => ({ ...ring, palette: groups[index]?.palette ?? DAY_PALETTE }));

    const legend = [
      ...groups.map((group) => ({
        key: group.key,
        label: group.label,
        note: group.fteText ? `換算 ${group.fteText}` : null,
        value: `${group.working}/${group.total}`,
        palette: group.palette,
      })),
      { key: "day", label: "今日の経過", value: `${Math.round(day * 100)}%`, palette: DAY_PALETTE },
    ];

    return { groups, present, total, rings, legend };
  }, [todayModel, nowMinutes, plan.ring, widget.photoBaseUrl, widget.scheduleUrl, actualEmployees]);

  const tomorrowView = useMemo(
    () => buildTomorrowView(tomorrowModel, todaySnapshot, tomorrowSnapshot),
    [tomorrowModel, todaySnapshot, tomorrowSnapshot],
  );

  const handleRefresh = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setSpin((value) => value + 360);
      setRefreshKey((prev) => prev + 1);
      mutateActual();
      if (widget.scheduleUrl) {
        mutateTodaySchedule();
        mutateTomorrowSchedule();
      }
    },
    [mutateActual, mutateTodaySchedule, mutateTomorrowSchedule, widget.scheduleUrl],
  );

  const handleTakadaManualToggle = useCallback(
    async (tile) => {
      const nextStatus = getNextTakadaManualStatus(tile.attendanceStatus, new Date(), todayModel.date || undefined);

      try {
        if (!nextStatus) {
          const response = await fetch("/api/uoattendance/takada", { method: "DELETE" });
          if (response.ok) {
            setTakadaManualStatus(null);
          }
          return;
        }

        const response = await fetch("/api/uoattendance/takada", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextStatus),
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setTakadaManualStatus(payload?.status || nextStatus);
      } catch (e) {
        // Keep the current display rather than surfacing a dashboard-level error.
      }
    },
    [todayModel.date],
  );

  if (actualError) {
    return <Container service={service} error={actualError} />;
  }

  if (!actualData) {
    return (
      <Container service={service}>
        <LoadingSkeleton />
      </Container>
    );
  }

  const today = formatDay(todayModel.date);
  const nothingToShow = view.groups.every((group) => group.tiles.length === 0);

  return (
    <Container service={service}>
      <div
        className={`@container flex w-full min-w-0 flex-col px-2.5 pb-2.5 pt-1 text-neutral-900 dark:text-white/95 ${RING_BASE_VARS}`}
      >
        {/* header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[15px] font-bold tracking-[0.04em]">今日出勤中</span>
          {today ? (
            <span className="text-[14px] font-extrabold tabular-nums text-neutral-600 dark:text-white/75">{today}</span>
          ) : null}
          <span className="ml-auto flex items-center gap-3">
            <span className="text-[16px] font-extrabold tabular-nums">{formatClock(nowMinutes)}</span>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 pl-2 pr-[9px] text-[11px] font-extrabold tracking-[0.08em] text-emerald-700 dark:border-[rgba(111,227,176,0.38)] dark:bg-[rgba(111,227,176,0.14)] dark:text-[#9DF2CC]">
              <span className="relative flex h-[7px] w-[7px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none dark:bg-[#6FE3B0]" />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-emerald-500 dark:bg-[#6FE3B0]" />
              </span>
              LIVE
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              className="grid h-[30px] w-[30px] place-items-center rounded-full border border-black/10 bg-black/5 text-neutral-700 transition-colors hover:bg-black/10 dark:border-white/15 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/15"
              title="更新"
              aria-label="更新"
            >
              <RefreshIcon
                className="h-[18px] w-[18px] transition-transform duration-700 ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none"
                style={{ transform: `rotate(${spin}deg)` }}
              />
            </button>
          </span>
        </div>

        {widget.scheduleUrl && todayScheduleError ? (
          <div className={`mt-2 text-[11px] ${TEXT_MUTED}`}>
            今日予定を取得できませんでした。現在出勤中のみ表示しています。
          </div>
        ) : null}

        {nothingToShow ? (
          <div className="mt-3.5 flex flex-col items-center gap-2.5 py-4">
            <span className={`text-[12px] ${TEXT_MUTED}`}>
              {todayModel.hasRoster ? "本日の予定はありません" : "現在、出勤者はいません"}
            </span>
            {widget.rosterCalendar ? (
              <span className="flex flex-wrap justify-center gap-2">
                <RosterCalendarLink department="Office">オフィス</RosterCalendarLink>
                <RosterCalendarLink department="Production">生産</RosterCalendarLink>
              </span>
            ) : null}
          </div>
        ) : (
          <div ref={gridRef} className="mt-3.5 grid gap-[18px] @3xl:grid-cols-[268px_minmax(0,1fr)]">
            <SummaryPanel rings={view.rings} present={view.present} total={view.total} legend={view.legend} />
            <div className={`flex min-w-0 gap-2.5 ${plan.split ? "flex-row" : "flex-col"}`}>
              {view.groups
                .filter((group) => group.tiles.length > 0)
                .map((group, index) => (
                  <DeptPanel
                    key={group.key}
                    group={group}
                    ring={plan.ring}
                    columns={plan.split ? plan.columns[index] : null}
                    showCalendar={Boolean(widget.rosterCalendar && CALENDAR_TITLES[group.key])}
                    onTakadaManualToggle={handleTakadaManualToggle}
                  />
                ))}
            </div>
          </div>
        )}

        {widget.scheduleUrl ? (
          <TomorrowFooter
            model={tomorrowView}
            error={tomorrowScheduleError}
            loading={!tomorrowScheduleData && !tomorrowScheduleError}
          />
        ) : null}
      </div>
    </Container>
  );
}
