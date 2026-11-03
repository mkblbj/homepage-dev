/*
 * uovacuum — お掃除ロボット card (Xiaomi X20+ through Home Assistant).
 *
 * Endpoints: "state" (GET, the model from vacuum-model.mjs) and "action" (POST,
 * one allowlisted command). The HA token never reaches the browser.
 *
 * Rules encoded here — do NOT "simplify" them:
 *   - 掃除開始 needs a second press within 3 s; everything else acts on one press.
 *   - unknown numbers render as "—", never 0.
 *   - drying / mop washing / dust collecting have no live state in HA, so their
 *     buttons only confirm that the command was sent.
 */
import classNames from "classnames";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useRef, useState } from "react";

import RobotArt, { ACCENT, ART_STYLES, CALM, STATUS_TONE } from "./robot-art";
import { ACTIVE_STATUSES } from "./vacuum-model.mjs";

import { formatProxyUrl } from "utils/proxy/api-helpers";
import useWidgetAPI from "utils/proxy/use-widget-api";

const NS = "uovacuum";
const DASH = "—";
const MODEL_NAME = "X20+";
const DEFAULT_REFRESH_INTERVAL = 15000;
const ACTIVE_REFRESH_INTERVAL = 5000;
// after any command, poll fast for a while so the card catches the robot reacting
const BOOST_DURATION = 30000;
const CONFIRM_WINDOW = 3000;
const FEEDBACK_DURATION = 10000;
const LOCATE_DURATION = 2400;
// the proxy gives up on Home Assistant after 8 s; this covers the homepage itself hanging
const COMMAND_TIMEOUT = 10000;

const RUNNING = ["preparing", "washingMidway", "cleaning"];
const AT_DOCK = ["docked", "charging"];
const DOCK_LOCKED = [...AT_DOCK, "preparing", "washingMidway", "returning"];
const SUCTIONS = ["quiet", "standard", "strong", "max"];

const TEXT = "text-theme-800 dark:text-theme-100";
const MUTED = "text-theme-600 dark:text-theme-300";
const SECONDARY_BUTTON =
  "flex h-11 items-center justify-center gap-2 rounded-md border border-theme-500/25 bg-theme-500/10 px-4 text-sm font-semibold enabled:hover:bg-theme-500/20";
const QUICK_BUTTON =
  "flex h-9 items-center gap-1.5 rounded-md bg-theme-500/10 px-3 text-[13px] font-medium enabled:hover:bg-theme-500/20";
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";

// a value that clears itself `duration` ms after being set
function useTimedState(duration) {
  const [value, setValue] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = useCallback(
    (next) => {
      clearTimeout(timer.current);
      setValue(next);
      if (next !== null) timer.current = setTimeout(() => setValue(null), duration);
    },
    [duration],
  );
  return [value, set];
}

function Icon({ d, children }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

function Stat({ label, value, unit, bar }) {
  const known = value !== null && value !== undefined;
  return (
    <div className="flex min-w-[88px] flex-col gap-1">
      <span className={classNames("text-[11px]", MUTED)}>{label}</span>
      <span className="text-xl font-semibold leading-[26px] tabular-nums">
        <span>{known ? value : DASH}</span>
        {known && <span className={classNames("ml-0.5 text-[11px] font-medium", MUTED)}>{unit}</span>}
      </span>
      {bar}
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation("common");
  const { widget } = service;

  const [fast, setFast] = useState(false);
  const [boosted, setBoosted] = useTimedState(BOOST_DURATION);
  const configured = Number(widget.refreshInterval);
  const baseInterval = configured > 0 ? configured : DEFAULT_REFRESH_INTERVAL;
  const refreshInterval = fast || boosted ? ACTIVE_REFRESH_INTERVAL : baseInterval;
  const { data, error, mutate } = useWidgetAPI(widget, "state", { refreshInterval });

  const [armed, setArmed] = useTimedState(CONFIRM_WINDOW);
  const [feedback, setFeedback] = useTimedState(FEEDBACK_DURATION);
  const [locating, setLocating] = useTimedState(LOCATE_DURATION);
  const [pendingSuction, setPendingSuction] = useState(null);

  const model = error ? null : data;
  const status = error ? "offline" : (data?.status ?? null);

  useEffect(() => {
    setFast(ACTIVE_STATUSES.includes(status));
  }, [status]);

  const send = useCallback(
    async (action, value) => {
      if (action === "suction") setPendingSuction(value);
      const controller = new AbortController();
      let timer;
      const timedOut = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, COMMAND_TIMEOUT);
      });
      try {
        const request = fetch(formatProxyUrl(widget, "action"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value === undefined ? { action } : { action, value }),
          signal: controller.signal,
        });
        const response = await Promise.race([request, timedOut]);
        if (!response.ok) throw new Error("rejected");
        setFeedback({ kind: "sent", action });
        if (action === "locate") setLocating(true);
        setBoosted(true);
        mutate();
      } catch {
        setFeedback({ kind: "failed", action });
      } finally {
        clearTimeout(timer);
        if (action === "suction") setPendingSuction(null);
      }
    },
    [widget, mutate, setFeedback, setLocating, setBoosted],
  );

  const live = status !== null && status !== "offline";
  const running = RUNNING.includes(status);
  const atDock = AT_DOCK.includes(status);
  const tone = STATUS_TONE[status] ?? CALM;

  const onStart = () => {
    if (armed) {
      setArmed(null);
      send("start");
    } else {
      setArmed(true);
    }
  };

  let startLabel = t(`${NS}.start`);
  if (running) startLabel = t(`${NS}.cleaningNow`);
  else if (armed) startLabel = t(`${NS}.confirmStart`);
  else if (status === "paused") startLabel = t(`${NS}.resume`);

  let detail = DASH;
  if (feedback) {
    detail = feedback.kind === "sent" ? t(`${NS}.sent.${feedback.action}`) : t(`${NS}.failed`);
  } else if (status === "error") {
    detail = model?.faultCode ? t(`${NS}.detail.error`, { code: model.faultCode }) : t(`${NS}.detail.errorNoCode`);
  } else if (status) {
    detail = t(`${NS}.detail.${status}`);
  }

  const current = model?.runScope === "current";
  const battery = model?.battery ?? null;
  const shownSuction = pendingSuction ?? model?.suction ?? null;
  const lowest = model?.consumables?.lowest ?? null;
  const worn = Boolean(model?.consumables?.low && lowest);

  return (
    <div className={classNames("uovac relative w-full overflow-hidden px-2 pb-2 pt-1", TEXT)}>
      <style>{ART_STYLES}</style>
      {status === "cleaning" && (
        <svg
          className="uovac-floor pointer-events-none absolute inset-x-0 top-0 h-[104px] w-full"
          viewBox="0 0 1368 104"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ stroke: ACCENT }}
        >
          <path d="M120 18 H1360 M120 42 H1360 M120 66 H1360 M120 90 H1360" />
        </svg>
      )}

      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-md bg-black/15">
          <RobotArt status={status} battery={battery} locating={Boolean(locating)} />
        </div>

        <div className="flex min-w-[180px] flex-1 flex-col lg:w-[300px] lg:flex-none">
          <div className="flex items-center gap-2.5">
            <span
              className={classNames("h-2 w-2 shrink-0 rounded-full", running && "uovac-dot-live")}
              style={{ backgroundColor: tone, boxShadow: `0 0 0 4px ${tone}26` }}
            />
            <span className="text-2xl font-bold leading-[30px] tracking-wide">
              {status ? t(`${NS}.status.${status}`) : DASH}
            </span>
            <span
              className={classNames(
                "rounded-full border border-theme-500/30 px-2 py-px text-[11px] font-semibold tracking-wide",
                MUTED,
              )}
            >
              {MODEL_NAME}
            </span>
          </div>
          <p
            className={classNames(
              "mt-0.5 truncate text-[13px] leading-5",
              feedback?.kind === "failed" ? "text-rose-600 dark:text-rose-300" : MUTED,
            )}
            role="status"
          >
            {detail}
          </p>
        </div>

        <div aria-hidden="true" className="hidden h-14 w-px shrink-0 bg-theme-500/20 lg:block" />

        <div className="flex items-start gap-8">
          <Stat
            label={t(`${NS}.battery`)}
            value={battery}
            unit="%"
            bar={
              <span className="block h-[3px] overflow-hidden rounded-sm bg-theme-500/20">
                <span
                  className="block h-full rounded-sm transition-[width] duration-500"
                  style={{ width: `${battery ?? 0}%`, backgroundColor: status === "error" ? tone : ACCENT }}
                />
              </span>
            }
          />
          <Stat
            label={t(`${NS}.${current ? "currentTime" : "lastTime"}`)}
            value={model?.cleaningMinutes ?? null}
            unit={t(`${NS}.minutes`)}
          />
          <Stat
            label={t(`${NS}.${current ? "currentArea" : "lastArea"}`)}
            value={model?.cleaningArea ?? null}
            unit={t(`${NS}.squareMeters`)}
          />
        </div>

        <div className="hidden flex-1 lg:block" />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={!live || running}
            className={classNames(
              "relative flex h-11 min-w-[184px] items-center justify-center gap-2 overflow-hidden rounded-md px-4 text-sm font-bold",
              DISABLED,
            )}
            style={{ backgroundColor: ACCENT, color: "#08201d" }}
          >
            <Icon d="M6.5 4.5v11l8.5-5.5z" />
            <span>{startLabel}</span>
            {armed && <span className="uovac-arm-bar" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => send("stop")}
            disabled={!live || !ACTIVE_STATUSES.includes(status)}
            className={classNames(SECONDARY_BUTTON, DISABLED)}
          >
            <Icon>
              <rect x="5" y="5" width="10" height="10" rx="2" />
            </Icon>
            <span>{t(`${NS}.stop`)}</span>
          </button>
          <button
            type="button"
            onClick={() => send("dock")}
            disabled={!live || DOCK_LOCKED.includes(status)}
            className={classNames(SECONDARY_BUTTON, DISABLED)}
          >
            <Icon d="M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z M8 17v-4.5h4V17" />
            <span>{t(`${NS}.dock`)}</span>
          </button>
        </div>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-theme-500/20 pt-3">
        <div className="flex items-center gap-3">
          <span id={`${NS}-suction-label`} className={classNames("text-[11px] tracking-wider", MUTED)}>
            {t(`${NS}.suction`)}
          </span>
          <div
            role="group"
            aria-labelledby={`${NS}-suction-label`}
            className="flex gap-0.5 rounded-lg bg-black/15 p-[3px]"
          >
            {SUCTIONS.map((id) => {
              const on = shownSuction === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  disabled={!live}
                  onClick={() => send("suction", id)}
                  className={classNames(
                    "h-[30px] min-w-[56px] rounded-md px-3 text-[13px] font-semibold",
                    // the design's #5eead4 text is unreadable on light themes
                    on ? "bg-teal-500/15 text-teal-700 dark:bg-teal-300/15 dark:text-teal-300" : MUTED,
                    DISABLED,
                  )}
                >
                  {t(`${NS}.suctionOptions.${id}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div aria-hidden="true" className="hidden h-6 w-px bg-theme-500/20 sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => send("dust")}
            disabled={!live || !atDock}
            className={classNames(QUICK_BUTTON, DISABLED)}
          >
            <Icon d="M4.5 6h11 M8 6V4.5h4V6 M6 6l.8 9.6a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L14 6" />
            <span>{t(`${NS}.dust`)}</span>
          </button>
          <button
            type="button"
            onClick={() => send("wash")}
            disabled={!live || !atDock}
            className={classNames(QUICK_BUTTON, DISABLED)}
          >
            <Icon d="M10 3.5c2.8 3.4 4.5 5.9 4.5 8a4.5 4.5 0 0 1-9 0c0-2.1 1.7-4.6 4.5-8z" />
            <span>{t(`${NS}.wash`)}</span>
          </button>
          <div role="group" aria-label={t(`${NS}.dry`)} className="flex items-center rounded-md bg-theme-500/10">
            <span className="flex h-9 items-center gap-1.5 pl-3 pr-1 text-[13px] font-medium">
              <Icon d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5 M3 12h11.5a2.5 2.5 0 1 1-2.5 2.5" />
              {t(`${NS}.dry`)}
            </span>
            <button
              type="button"
              aria-label={`${t(`${NS}.dry`)} ${t(`${NS}.dryStart`)}`}
              onClick={() => send("dryStart")}
              disabled={!live || !atDock}
              className={classNames("h-9 px-2.5 text-[13px] font-medium enabled:hover:bg-theme-500/20", DISABLED)}
            >
              {t(`${NS}.dryStart`)}
            </button>
            <span aria-hidden="true" className="h-4 w-px bg-theme-500/30" />
            <button
              type="button"
              aria-label={`${t(`${NS}.dry`)} ${t(`${NS}.dryStop`)}`}
              onClick={() => send("dryStop")}
              disabled={!live || !atDock}
              className={classNames(
                "h-9 rounded-r-md px-2.5 text-[13px] font-medium enabled:hover:bg-theme-500/20",
                DISABLED,
              )}
            >
              {t(`${NS}.dryStop`)}
            </button>
          </div>
          <button
            type="button"
            onClick={() => send("locate")}
            disabled={!live}
            className={classNames(QUICK_BUTTON, DISABLED)}
          >
            <Icon d="M6 13V9a4 4 0 0 1 8 0v4l1.5 2h-11z M8.5 17.2a1.6 1.6 0 0 0 3 0" />
            <span>{t(`${NS}.locate`)}</span>
          </button>
        </div>

        <div className="hidden flex-1 sm:block" />

        {lowest && (
          <div
            className={classNames(
              "flex h-[30px] items-center gap-2 rounded-full px-3 text-xs",
              worn
                ? "bg-amber-400/15 font-semibold text-amber-700 dark:text-amber-300"
                : classNames("bg-theme-500/10", MUTED),
            )}
          >
            {worn ? (
              <Icon d="M10 3.5 17 16H3z M10 8.5v3.4 M10 14.2v.1" />
            ) : (
              <Icon d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M7 10.2l2 2 4-4.2" />
            )}
            <span>
              {worn
                ? t(`${NS}.consumables.low`, { part: t(`${NS}.consumables.${lowest.part}`), percent: lowest.percent })
                : t(`${NS}.consumables.ok`)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
