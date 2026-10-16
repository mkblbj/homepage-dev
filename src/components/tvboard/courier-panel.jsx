import classNames from "classnames";

import { cardStateClass, Loading, Stamp, Unavailable, Unconfigured } from "./parts";
import { BAR_SHADES } from "./shipping-model.mjs";
import { formatMd } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

// Segments narrower than this carry no number inside; the legend still lists them.
const LABEL_MIN_SHARE = 0.12;

function scopeChip(couriers) {
  const day = formatMd(couriers.date);
  if (!couriers.recorded) return <span className={styles.chipOutline}>昨日 {day} の記録なし</span>;
  if (couriers.scope === "today") return <span className={styles.chipSolid}>今日 {day} の分</span>;
  return (
    <span className={styles.chipOutline}>
      昨日 {day} {couriers.total == null ? "" : `${couriers.total.toLocaleString("ja-JP")} 件`}
    </span>
  );
}

export default function CourierPanel({ couriers, state, stampMs, lastOkAt }) {
  const total = couriers.items.reduce((sum, item) => sum + item.qty, 0);

  let body;
  if (state === "unconfigured") body = <Unconfigured />;
  else if (state === "loading") body = <Loading />;
  else if (state === "unavailable") body = <Unavailable what="出荷データ" lastOkAt={lastOkAt} compact />;
  else if (couriers.items.length === 0) body = <div className={styles.loading}>記録がありません</div>;
  else {
    body = (
      <>
        <div className={styles.courierBar}>
          {couriers.items.map((item, rank) => (
            <div
              key={item.name}
              className={styles.courierSegment}
              style={{ width: `${(item.qty / total) * 100}%`, background: BAR_SHADES[rank] ?? BAR_SHADES.at(-1) }}
            >
              {item.qty / total >= LABEL_MIN_SHARE ? item.qty.toLocaleString("ja-JP") : ""}
            </div>
          ))}
        </div>
        <div className={styles.courierLegend}>
          {couriers.items.map((item, rank) => (
            <span key={item.name}>
              <span className={styles.swatch} style={{ background: BAR_SHADES[rank] ?? BAR_SHADES.at(-1) }} />
              {item.name}
              <span className={styles.num} style={{ fontSize: 24 }}>
                {item.qty.toLocaleString("ja-JP")}
              </span>
            </span>
          ))}
        </div>
      </>
    );
  }

  return (
    <section
      className={classNames(styles.card, styles.panel, cardStateClass(state))}
      style={{ flex: "1 1 auto", gap: 14, animationDelay: "0.4s" }}
    >
      <div className={styles.cardHead}>
        <h2 className={styles.panelTitle} style={{ whiteSpace: "nowrap" }}>
          配送方法別
        </h2>
        {state === "ok" || state === "delayed" ? scopeChip(couriers) : null}
      </div>
      {body}
      <Stamp state={state} stampMs={stampMs} className={styles.courierStamp} />
    </section>
  );
}
