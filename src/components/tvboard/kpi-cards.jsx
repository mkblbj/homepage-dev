import classNames from "classnames";

import { cardStateClass, Loading, Stamp, Unavailable, Unconfigured } from "./parts";
import RollingNumber from "./rolling-number";
import { formatMd } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

// Four digits ("1,100") need a smaller face to fit a third of the width.
export const heroSize = (value) => (value != null && Math.abs(value) >= 1000 ? 132 : 180);

function Body({ state, lastOkAt, what, children }) {
  if (state === "unconfigured") return <Unconfigured />;
  if (state === "loading") return <Loading />;
  if (state === "unavailable") return <Unavailable what={what} lastOkAt={lastOkAt} compact />;
  return children;
}

function Hero({ value, tone }) {
  return (
    <div className={styles.heroRow}>
      <RollingNumber value={value} size={heroSize(value)} showDelta style={tone ? { color: tone } : undefined} />
      <span className={styles.heroUnit}>件</span>
    </div>
  );
}

function Tile({ title, date, state, stampMs, lastOkAt, what, delay, children }) {
  return (
    <section className={classNames(styles.card, styles.tile, cardStateClass(state))} style={{ animationDelay: delay }}>
      <div className={styles.cardHead}>
        <h2 className={styles.tileTitle}>{title}</h2>
        {date ? <span className={styles.tileDate}>{date}</span> : <Stamp state={state} stampMs={stampMs} />}
      </div>
      <Body state={state} lastOkAt={lastOkAt} what={what}>
        {children}
      </Body>
    </section>
  );
}

export function OutputCard({ view, state, stampMs, lastOkAt }) {
  const { total, yesterdayTotal, yesterdayDate } = view.output;
  return (
    <Tile title="今日の出力" state={state} stampMs={stampMs} lastOkAt={lastOkAt} what="出荷出力データ">
      <Hero value={total} />
      <span className={styles.tileNote}>
        {yesterdayTotal == null ? "" : `昨日 ${formatMd(yesterdayDate)} ${yesterdayTotal.toLocaleString("ja-JP")} 件`}
      </span>
    </Tile>
  );
}

export function TomorrowCard({ view, state, lastOkAt }) {
  const { tomorrow } = view;
  let main;
  let note;
  if (tomorrow.stage === "accruing") {
    main = <Hero value={tomorrow.total} />;
    note = "まだ増えます";
  } else if (tomorrow.stage === "predicted") {
    main = (
      <div className={styles.heroRow}>
        <span className={styles.heroUnit} style={{ color: "#C9D2DA" }}>
          約
        </span>
        <RollingNumber value={tomorrow.predicted} size={heroSize(tomorrow.predicted)} style={{ color: "#C9D2DA" }} />
        <span className={styles.heroUnit}>件</span>
      </div>
    );
    note = "見込みの数です";
  } else {
    main = <span className={styles.heroWord}>未確定</span>;
    note = "午後から入力が始まります";
  }

  return (
    <Tile
      title="明日の予定"
      date={formatMd(tomorrow.date)}
      state={state}
      lastOkAt={lastOkAt}
      what="出荷出力データ"
      delay="0.1s"
    >
      {main}
      <span className={styles.tileNote}>{note}</span>
    </Tile>
  );
}

export function OrdersCard({ view, state, stampMs, lastOkAt }) {
  return (
    <Tile title="楽天 今日の注文" state={state} stampMs={stampMs} lastOkAt={lastOkAt} what="楽天の注文データ" delay="0.2s">
      <Hero value={view.orders} />
      {view.missing > 0 ? (
        <span className={styles.tileNote} style={{ color: "#FCA5A5", fontWeight: 700 }}>
          {view.missing} 店舗を含みません
        </span>
      ) : (
        <span className={styles.tileNote}>{view.shopCount > 0 ? `${view.shopCount} 店舗の合計` : ""}</span>
      )}
    </Tile>
  );
}
