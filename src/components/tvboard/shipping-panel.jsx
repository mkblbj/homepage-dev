import classNames from "classnames";

import { cardStateClass, Loading, Stamp, Unavailable, Unconfigured } from "./parts";
import RollingNumber from "./rolling-number";
import { formatMd } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

const MAX_COURIERS = 6;

function Today({ shipping }) {
  if (shipping.state === "accruing") {
    return (
      <div className={styles.shipToday}>
        <div className={styles.heroRow}>
          <RollingNumber value={shipping.total} size={shipping.total >= 1000 ? 128 : 150} showDelta />
          <span className={styles.heroUnit}>件</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span className={classNames(styles.pill, styles.pillOk)}>計上中</span>
          {shipping.firstAt ? <span className={styles.tileNote}>{shipping.firstAt} から</span> : null}
        </span>
      </div>
    );
  }
  if (shipping.state === "unknown") {
    return <span className={styles.tileNote}>今日の出荷データがありません</span>;
  }
  return (
    <div className={styles.shipToday}>
      <span className={styles.heroWord} style={{ color: "#F1F4F6", fontSize: 76 }}>
        未計上
      </span>
      <span className={styles.tileNote}>計上されると数が出ます</span>
    </div>
  );
}

function scopeChip(couriers) {
  if (!couriers.recorded) return null;
  const day = formatMd(couriers.date);
  return couriers.scope === "today" ? (
    <span className={styles.chipSolid}>今日 {day} の内訳</span>
  ) : (
    <span className={styles.chipOutline}>昨日 {day} の内訳</span>
  );
}

// 今日の出荷 and its courier breakdown in one panel, every number shown once.
export default function ShippingPanel({ view, state, stampMs, lastOkAt }) {
  const { shipping, couriers } = view;
  const { yesterday } = shipping;
  const shown = couriers.items.slice(0, MAX_COURIERS);
  const hidden = couriers.items.length - shown.length;
  const max = Math.max(0, ...shown.map((item) => item.qty));

  let body;
  if (state === "unconfigured") body = <Unconfigured />;
  else if (state === "loading") body = <Loading />;
  else if (state === "unavailable") body = <Unavailable what="出荷データ" lastOkAt={lastOkAt} />;
  else {
    body = (
      <div className={styles.shipBody}>
        <div className={styles.shipLeft}>
          <Today shipping={shipping} />
          <span className={styles.tileNote}>
            {yesterday.recorded
              ? `昨日 ${formatMd(yesterday.date)} ${yesterday.total?.toLocaleString("ja-JP") ?? "—"} 件`
              : `昨日 ${formatMd(yesterday.date)} の記録なし`}
          </span>
        </div>
        <div className={styles.shipRight}>
          <div className={styles.cardHead}>
            <span className={styles.shipSubTitle}>配送方法別</span>
            {scopeChip(couriers)}
          </div>
          {shown.length === 0 ? (
            <div className={styles.loading}>記録がありません</div>
          ) : (
            shown.map((item) => (
              <div key={item.name} className={styles.courierRow}>
                <span className={styles.courierName}>{item.name}</span>
                <div className={styles.courierTrack}>
                  <span style={{ width: `${max > 0 ? Math.max(1, (item.qty / max) * 100) : 0}%` }} />
                </div>
                <RollingNumber value={item.qty} size={46} className={styles.courierQty} />
              </div>
            ))
          )}
          {hidden > 0 ? <span className={styles.tileNote}>ほか {hidden} 種類</span> : null}
        </div>
      </div>
    );
  }

  return (
    <section className={classNames(styles.card, styles.shipPanel, cardStateClass(state))} style={{ animationDelay: "0.3s" }}>
      <div className={styles.cardHead}>
        <h2 className={styles.tileTitle}>今日の出荷</h2>
        <Stamp state={state} stampMs={stampMs} />
      </div>
      {body}
    </section>
  );
}
