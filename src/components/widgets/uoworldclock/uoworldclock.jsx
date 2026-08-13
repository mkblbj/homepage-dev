import { useEffect, useState } from "react";

import Container from "../widget/container";
import Raw from "../widget/raw";

import { resolveClockState } from "./clock-state";
import Flag, { hasFlag } from "./flags";

const stateStyles = {
  working: {
    line: "border-emerald-400/70",
    time: "text-theme-800 dark:text-theme-200",
    muted: "text-theme-600 dark:text-theme-400",
  },
  daytime: {
    line: "border-amber-500/70",
    time: "text-theme-800 dark:text-theme-200",
    muted: "text-theme-600 dark:text-theme-400",
  },
  // 夜间档靠冷色调与竖线颜色表达「那边没人」，而不是靠压暗——
  // 压暗会让日期行跌破 WCAG AA 对小字要求的 4.5:1。
  night: {
    line: "border-slate-400/80",
    time: "text-slate-600 dark:text-slate-300",
    muted: "text-slate-500 dark:text-slate-400",
  },
};

// 主号 = hour、minute，以及夹在两者之间的 literal；其余（second、dayPeriod、分秒之间的 literal）为次号。
// 按 parts 原顺序渲染，ja 的「午前」自动前置、en-GB 的 am 自动后置，无需任何 locale 判断。
function splitTimeParts(parts) {
  const hourIndex = parts.findIndex((part) => part.type === "hour");
  const minuteIndex = parts.findIndex((part) => part.type === "minute");

  return parts.map((part, index) => ({
    ...part,
    primary:
      part.type === "hour" ||
      part.type === "minute" ||
      (part.type === "literal" && index > hourIndex && index < minuteIndex),
  }));
}

// 配了可识别的 flag 就渲染内联 SVG，否则退回文字 label——
// 未知的 flag code 同样退回文字，不至于让标识整个消失。
function FlagOrLabel({ flag, label }) {
  if (hasFlag(flag)) {
    return (
      <span className="uoworldclock-flag flex items-center">
        <Flag code={flag} />
      </span>
    );
  }
  return label ? <span className="text-sm">{label}</span> : null;
}

export default function UoWorldClock({ options }) {
  const { label, flag, locale, timeZone, workHours, dayHours, workdays, dateFormat, stateLabels } = options;
  const [now, setNow] = useState(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // 服务端与客户端时刻不同会导致 hydration 不一致，因此首帧只渲染骨架。
  // 容器仍然挂上 class，保证 config/custom.js 能立刻找到锚点。
  const state = now ? resolveClockState(now, { timeZone, workHours, dayHours, workdays }) : null;
  const styles = stateStyles[state ?? "daytime"];

  const timeParts = now
    ? splitTimeParts(
        new Intl.DateTimeFormat(locale, {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).formatToParts(now),
      )
    : [];

  const dateText = now ? new Intl.DateTimeFormat(locale, { timeZone, ...dateFormat }).format(now) : "";
  const stateText = state ? stateLabels?.[state] : "";

  return (
    <Container options={options} additionalClassNames="information-widget-uoworldclock">
      <Raw>
        <div className={`uoworldclock-line flex flex-row items-center gap-2.5 border-l-2 pl-3 ${styles.line}`}>
          <FlagOrLabel flag={flag} label={label} />
          <div className={`uoworldclock-time leading-tight tabular-nums ${styles.time}`}>
            {timeParts.map((part, index) => (
              <span
                // parts 由 Intl 生成，顺序稳定且无独立 id，用 index 作 key 是安全的
                key={index}
                className={
                  part.primary ? "uoworldclock-primary text-2xl font-medium" : "uoworldclock-secondary text-sm"
                }
              >
                {part.value}
              </span>
            ))}
          </div>
          <div className={`text-xs ${styles.muted}`}>
            {dateText}
            {stateText ? ` · ${stateText}` : ""}
          </div>
        </div>
      </Raw>
    </Container>
  );
}
