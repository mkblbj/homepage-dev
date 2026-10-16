import classNames from "classnames";

import { cardStateClass, Loading, ShopLogo, Stamp, Unavailable, Unconfigured } from "./parts";
import RollingNumber from "./rolling-number";
import { formatMd } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

export function OrdersPanel({ view, state, stampMs, lastOkAt, monthState, todayYmd }) {
  const { today, month, shops, missing } = view;
  const monthLabel = month.toDay ? `${todayYmd.slice(5, 7).replace(/^0/, "")}/1〜${month.toDay}` : "";
  const monthKnown = monthState === "ok" || monthState === "delayed";
  const maxOrders = Math.max(0, ...shops.map((shop) => shop.orders ?? 0));

  let body;
  if (state === "unconfigured") body = <Unconfigured />;
  else if (state === "loading") body = <Loading />;
  else if (state === "unavailable") body = <Unavailable what="楽天の注文データ" lastOkAt={lastOkAt} />;
  else {
    body = (
      <>
        <div className={styles.ordersTable}>
          <span />
          <span className={styles.ordersColHead}>
            本日<span>{formatMd(todayYmd)}</span>
          </span>
          <span className={styles.ordersColHead}>
            今月<span>{monthLabel}</span>
          </span>

          <span className={styles.ordersRowHead}>
            注文<span>件</span>
          </span>
          <RollingNumber value={today.orders} size={108} showDelta />
          <RollingNumber value={monthKnown ? month.orders : null} size={84} style={{ color: "#C9D2DA" }} />

          <span className={styles.ordersRowHead}>
            販売<span>点</span>
          </span>
          <RollingNumber value={today.units} size={108} showDelta />
          <RollingNumber value={monthKnown ? month.units : null} size={84} style={{ color: "#C9D2DA" }} />
        </div>

        <div className={styles.ordersShopHead}>
          <span>店舗別 本日の注文(件)</span>
          <small>{monthKnown && month.includesToday ? "今月の数は今日の分を含みます" : ""}</small>
        </div>
        <div className={styles.shopTiles} style={{ gridTemplateColumns: `repeat(${Math.max(shops.length, 1)}, minmax(0, 1fr))` }}>
          {shops.map((shop) => (
            <div key={shop.name} className={styles.shopTile}>
              <ShopLogo
                name={shop.name}
                url={shop.logoUrl}
                className={classNames(shop.failed && styles.logoFailed, !shop.failed && shop.orders === 0 && styles.logoDim)}
              />
              {shop.failed ? (
                <span className={styles.shopFailed}>取得不可</span>
              ) : (
                <RollingNumber value={shop.orders} size={32} style={shop.orders === 0 ? { color: "#7D8A96" } : undefined} />
              )}
              <div className={styles.shopBar}>
                <span style={{ width: maxOrders > 0 && shop.orders ? `${(shop.orders / maxOrders) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <section className={classNames(styles.card, styles.panel, cardStateClass(state))} style={{ animationDelay: "0.3s" }}>
      <div className={styles.cardHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h2 className={styles.panelTitle}>楽天の注文</h2>
          {missing > 0 ? (
            <span className={classNames(styles.pill, styles.pillBad)}>{missing} 店舗を含みません</span>
          ) : (
            <span className={styles.cardDate}>{shops.length > 0 ? `${shops.length} 店舗の合計` : ""}</span>
          )}
        </div>
        <Stamp state={state} stampMs={stampMs} />
      </div>
      {body}
    </section>
  );
}

export function AttentionPanel({ view, state, stampMs, lastOkAt }) {
  const total = view?.total ?? null;
  const busy = total > 0;

  let body;
  if (state === "unconfigured") body = <Unconfigured />;
  else if (state === "loading") body = <Loading />;
  else if (state === "unavailable" || !view) body = <Unavailable what="未対応データ" lastOkAt={lastOkAt} compact />;
  else {
    body = (
      <div className={styles.attentionRow}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flex: "none" }}>
          <RollingNumber value={total} size={72} tone="amber" style={busy ? { color: "#FCD34D" } : undefined} />
          <span className={styles.unit} style={{ fontSize: 26 }}>
            件
          </span>
        </div>
        {busy ? (
          <div className={styles.attentionShops}>
            {view.shops.map((shop) => (
              <div key={shop.name} className={styles.badgeLogo}>
                <ShopLogo name={shop.name} url={shop.logoUrl} />
                <span className={classNames(styles.badge, shop.tone === "critical" ? styles.badgeCritical : styles.badgeAttention)}>
                  {shop.count ?? "?"}
                </span>
              </div>
            ))}
            {view.moreCount > 0 ? (
              <span className={styles.muted} style={{ fontSize: 20, whiteSpace: "nowrap" }}>
                ほか {view.moreCount}
              </span>
            ) : null}
          </div>
        ) : view.partial ? (
          <span className={styles.muted} style={{ fontSize: 22 }}>
            一部の件数が不明です
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 26, fontWeight: 700, color: "#34D399" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            なし
          </span>
        )}
      </div>
    );
  }

  const breakdown = [];
  if (view?.inquiries != null) breakdown.push(`問い合わせ ${view.inquiries}`);
  if (view?.reviews != null) breakdown.push(`レビュー ${view.reviews}`);
  if (view?.pending > 0) breakdown.push(`未確認注文 ${view.pending}`);
  const showing = state === "ok" || state === "delayed";

  const shownState = state === "ok" && view?.stale ? "delayed" : state;
  return (
    <section
      className={classNames(styles.card, styles.panel, busy && styles.amberCard, cardStateClass(shownState))}
      style={{ height: 196, flex: "none", justifyContent: "space-between", animationDelay: "0.5s" }}
    >
      <div className={styles.cardHead}>
        <h2 style={{ fontSize: 28, whiteSpace: "nowrap" }}>楽天 未対応</h2>
        {showing && view ? (
          <span className={styles.attentionBreakdown}>
            <span>{breakdown.join(" ・ ")}</span>
            {view.overdue > 0 ? <span style={{ color: "#FCA5A5", fontWeight: 700 }}>うち 期限超過 {view.overdue}</span> : null}
          </span>
        ) : null}
      </div>
      {body}
      <Stamp state={shownState} stampMs={stampMs} className={styles.courierStamp} />
    </section>
  );
}
