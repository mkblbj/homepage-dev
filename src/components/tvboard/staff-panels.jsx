import classNames from "classnames";

import { formatClock as minutesClock } from "../../widgets/uoattendance/ring-model.mjs";

import { Avatar, cardStateClass, Loading, resolvePhotoUrl, Stamp, Unavailable, Unconfigured } from "./parts";
import { barGeometry, layoutRows } from "./shift-model.mjs";
import { formatMd } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

// Row geometry, matching .shiftRow: name 120 | gap 10 | track | gap 10 | label 78, inside 404px.
const NAME_COLUMN = 120;
const COLUMN_GAP = 10;
const TRACK = 404 - NAME_COLUMN - 78 - COLUMN_GAP * 2;
const PAGE_MS = 10e3;

const BAR_CLASS = {
  over: null,
  done: styles.barDone,
  late: styles.barLate,
  absent: styles.barAbsent,
  up: styles.barUp,
  extra: styles.barExtra,
};

const LABEL_CLASS = {
  over: styles.labelWarn,
  late: styles.labelWarn,
  absent: styles.labelBad,
  done: styles.labelMuted,
  extra: styles.labelMuted,
};

function ShiftRow({ row, axis, nowMinutes, photoBase, height }) {
  const g = barGeometry(row, axis, nowMinutes);
  return (
    <div className={styles.shiftRow} style={{ height }}>
      <span className={styles.person}>
        <Avatar
          id={row.id}
          initial={row.initial}
          photoUrl={resolvePhotoUrl(row.image, photoBase)}
          className={classNames(row.kind === "late" && styles.avatarWarn, row.kind === "done" && styles.avatarGone)}
        />
        <b>{row.name}</b>
      </span>
      <div className={styles.barTrack}>
        <div className={classNames(styles.bar, BAR_CLASS[row.kind])} style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%` }}>
          <span style={{ width: `${g.pastPct}%` }} />
        </div>
        {g.overPct > 0 ? <div className={styles.overtime} style={{ left: `${g.leftPct + g.widthPct}%`, width: `${g.overPct}%` }} /> : null}
      </div>
      <span className={classNames(styles.shiftLabel, LABEL_CLASS[row.kind])}>{row.label}</span>
    </div>
  );
}

export function ShiftTimeline({ timeline, nowMinutes, nowMs, photoBase, state, stampMs, lastOkAt }) {
  const { rows, axis } = timeline;
  const layout = layoutRows(rows.length);
  const page = layout.pages > 1 ? Math.floor(nowMs / PAGE_MS) % layout.pages : 0;
  const visible = rows.slice(page * layout.perPage, (page + 1) * layout.perPage);
  const share = Math.min(1, Math.max(0, (nowMinutes - axis.start) / (axis.end - axis.start)));
  const nowLeft = NAME_COLUMN + COLUMN_GAP + TRACK * share;

  let body;
  if (state === "unconfigured") body = <Unconfigured />;
  else if (state === "loading") body = <Loading />;
  else if (state === "unavailable") body = <Unavailable what="勤怠データ" lastOkAt={lastOkAt} />;
  else if (rows.length === 0) body = <div className={styles.loading}>今日の生産スタッフはいません</div>;
  else {
    body = (
      <div className={styles.timeline}>
        {visible.map((row) => (
          <ShiftRow key={row.id} row={row} axis={axis} nowMinutes={nowMinutes} photoBase={photoBase} height={layout.rowHeight} />
        ))}
        <div className={styles.nowLine} style={{ left: nowLeft }} />
        <span className={styles.nowTag} style={{ left: nowLeft }}>
          {minutesClock(nowMinutes)}
        </span>
        {layout.pages > 1 ? (
          <span className={styles.pager}>
            {page + 1} / {layout.pages}
          </span>
        ) : null}
      </div>
    );
  }

  const showCount = state === "ok" || state === "delayed";
  return (
    <section className={classNames(styles.card, styles.staffPanel, cardStateClass(state))} style={{ flex: "1 1 auto", animationDelay: "0.2s" }}>
      <div className={styles.cardHead} style={{ alignItems: "baseline" }}>
        <h2 className={styles.staffTitle}>今日のスタッフ</h2>
        {showCount ? (
          <span>
            <span className={styles.num} style={{ fontSize: 60 }}>
              {timeline.working}
            </span>
            <span className={styles.muted} style={{ fontSize: 26 }}>
              {" "}
              名 出勤中
            </span>
          </span>
        ) : null}
      </div>
      <Stamp state={state} stampMs={stampMs} />
      {body}
    </section>
  );
}

const MAX_TOMORROW = 10;

export function TomorrowShifts({ view, state, photoBase, lastOkAt }) {
  const people = view.people.length > MAX_TOMORROW ? view.people.slice(0, MAX_TOMORROW - 1) : view.people;
  const rest = view.people.length - people.length;

  let body;
  if (state === "unconfigured") body = <Unconfigured />;
  else if (state === "loading") body = <Loading />;
  else if (state === "unavailable") body = <Unavailable what="シフト" lastOkAt={lastOkAt} compact />;
  else if (view.count === null) body = <div className={styles.loading}>データがありません</div>;
  else if (view.count === 0) body = <div className={styles.loading}>予定なし</div>;
  else {
    body = (
      <div className={styles.tomorrowGrid}>
        {people.map((person) => (
          <div key={person.id} className={styles.tomorrowPerson}>
            <Avatar id={person.id} initial={person.initial} photoUrl={resolvePhotoUrl(person.image, photoBase)} />
            <b>{person.name}</b>
          </div>
        ))}
        {rest > 0 ? (
          <div className={styles.tomorrowPerson}>
            <span className={styles.avatar} style={{ background: "#222B34" }}>
              +{rest}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={classNames(styles.card, styles.staffPanel, cardStateClass(state))}
      style={{ height: 250, flex: "none", gap: 18, animationDelay: "0.3s" }}
    >
      <div className={styles.cardHead} style={{ alignItems: "baseline" }}>
        <h2 className={styles.staffTitle} style={{ fontSize: 30 }}>
          明日のスタッフ
        </h2>
        <span className={styles.muted} style={{ fontSize: 22, whiteSpace: "nowrap" }}>
          {formatMd(view.date)}
          {view.count ? (
            <>
              {" "}
              <span className={styles.num} style={{ fontSize: 40, color: "#F1F4F6" }}>
                {view.count}
              </span>
              名
            </>
          ) : null}
        </span>
      </div>
      {body}
    </section>
  );
}
