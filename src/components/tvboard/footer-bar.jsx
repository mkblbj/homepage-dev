import { formatClock, formatLongDate, jstNow } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

const STATUS_COLOR = { delayed: "#FBBF24", unavailable: "#F87171" };
const STATUS_INK = { delayed: "#FCD34D", unavailable: "#FCA5A5" };

function Segments({ segments }) {
  return segments.map((segment) => (
    <span key={segment.key} style={{ display: "contents" }}>
      <span className={styles.tickerTag}>{segment.tag}</span>
      {segment.parts.map((part, index) => (
        <span key={part} className={index === 0 ? undefined : styles.tickerSub}>
          {part}
        </span>
      ))}
    </span>
  ));
}

export default function FooterBar({ clock, axis, segments, statuses }) {
  const now = jstNow(clock);
  const progress = Math.min(1, Math.max(0, (now.minutes - axis.start) / (axis.end - axis.start)));
  const problems = statuses.filter((status) => status.state === "delayed" || status.state === "unavailable");
  const loading = statuses.some((status) => status.state === "loading");

  return (
    <footer className={styles.footer}>
      <span className={styles.progressTrack} />
      <span className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
      <span className={styles.progressDot} style={{ left: `${progress * 100}%` }} />

      <div className={styles.clock}>
        <span style={{ fontSize: 28, fontWeight: 700, color: "#C9D2DA" }}>{formatLongDate(now.ymd)}</span>
        <span className={styles.num} style={{ fontSize: 60 }}>
          {formatClock(clock)}
        </span>
      </div>
      <span className={styles.divider} />

      <div className={styles.ticker}>
        {segments.length > 0 ? (
          <div className={styles.tickerTrack}>
            <span className={styles.tickerCopy}>
              <Segments segments={segments} />
            </span>
            <span className={styles.tickerCopy} aria-hidden="true">
              <Segments segments={segments} />
            </span>
          </div>
        ) : null}
      </div>

      <div className={styles.statusList}>
        {problems.length === 0 && loading ? (
          <span className={styles.statusItem} style={{ color: "#7D8A96" }}>
            読み込み中…
          </span>
        ) : problems.length === 0 ? (
          <span className={styles.statusItem} style={{ color: "#34D399" }}>
            <span className={styles.statusDot} style={{ background: "#34D399" }} />
            データ正常
          </span>
        ) : (
          problems.slice(0, 2).map((status) => (
            <span key={status.name} className={styles.statusItem} style={{ color: STATUS_INK[status.state] }}>
              <span className={styles.statusDot} style={{ background: STATUS_COLOR[status.state] }} />
              {status.name}：{status.detail}
            </span>
          ))
        )}
      </div>
    </footer>
  );
}
