import classNames from "classnames";

import { cardStateClass, Loading, Stamp, Unavailable, Unconfigured } from "./parts";
import RollingNumber from "./rolling-number";
import { formatMd } from "./tv-time.mjs";
import styles from "./tvboard.module.css";

function Body({ state, lastOkAt, children }) {
  if (state === "unconfigured") return <Unconfigured />;
  if (state === "loading") return <Loading />;
  if (state === "unavailable") return <Unavailable what="出荷出力データ" lastOkAt={lastOkAt} compact />;
  return children;
}

export function OutputCard({ view, state, stampMs, lastOkAt }) {
  const { total, yesterdayTotal, yesterdayDate, date } = view.output;
  const max = Math.max(total ?? 0, yesterdayTotal ?? 0);
  const width = (value) => (max > 0 && value != null ? `${(value / max) * 100}%` : "0%");

  return (
    <section className={classNames(styles.card, styles.kpiCard, cardStateClass(state))}>
      <span className={styles.sweep} />
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>今日の出力</h2>
        <span className={styles.cardDate}>{formatMd(date)}</span>
      </div>
      <Body state={state} lastOkAt={lastOkAt}>
        <div className={styles.bigNumberRow}>
          <RollingNumber value={total} size={136} showDelta />
          <span className={styles.unit} style={{ fontSize: 36 }}>
            件
          </span>
        </div>
        <div className={styles.compareRows}>
          <div className={styles.compareRow}>
            <span>昨日 {formatMd(yesterdayDate)}</span>
            <div className={styles.compareTrack}>
              <div className={styles.compareFill} style={{ width: width(yesterdayTotal), background: "#5B6B7A" }} />
            </div>
            <span className={styles.compareValue}>{yesterdayTotal == null ? "—" : yesterdayTotal.toLocaleString("ja-JP")}</span>
          </div>
          <div className={classNames(styles.compareRow, styles.compareRowToday)}>
            <span>今日 {formatMd(date)}</span>
            <div className={styles.compareTrack}>
              <div className={styles.compareFill} style={{ width: width(total), background: "#4C93E0" }} />
            </div>
            <span className={styles.compareValue}>{total == null ? "—" : total.toLocaleString("ja-JP")}</span>
          </div>
        </div>
        <div className={styles.cardFoot}>
          <Stamp state={state} stampMs={stampMs} />
        </div>
      </Body>
    </section>
  );
}

export function ShippingCard({ view, state, stampMs, lastOkAt }) {
  const { shipping } = view;
  const { yesterday } = shipping;

  return (
    <section className={classNames(styles.card, styles.kpiCard, cardStateClass(state))} style={{ animationDelay: "0.1s" }}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>今日の出荷</h2>
        <span className={styles.cardDate}>{formatMd(shipping.date)}</span>
      </div>
      <Body state={state} lastOkAt={lastOkAt}>
        {shipping.state === "accruing" ? (
          <>
            <div className={styles.bigNumberRow}>
              <RollingNumber value={shipping.total} size={100} showDelta />
              <span className={styles.unit} style={{ fontSize: 32 }}>
                件
              </span>
            </div>
            <div className={styles.bigNumberRow} style={{ alignItems: "center" }}>
              <span className={classNames(styles.pill, styles.pillOk)}>計上中</span>
              {shipping.firstAt ? <span className={styles.muted} style={{ fontSize: 20 }}>{shipping.firstAt} から</span> : null}
            </div>
          </>
        ) : shipping.state === "unknown" ? (
          <span className={styles.muted} style={{ fontSize: 26 }}>
            今日の出荷データがありません
          </span>
        ) : (
          <div className={styles.pendingRow}>
            <span className={styles.pendingBadge}>計上前</span>
            <div className={styles.pendingText}>
              <span style={{ fontSize: 34, fontWeight: 700, whiteSpace: "nowrap" }}>今日分は未計上</span>
              {yesterday.recordedAt ? (
                <span className={styles.muted} style={{ fontSize: 20 }}>
                  昨日は {yesterday.recordedAt} に計上
                </span>
              ) : null}
            </div>
          </div>
        )}
        <div className={styles.referenceBox}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#C9D2DA", whiteSpace: "nowrap" }}>
            昨日 {formatMd(yesterday.date)} {yesterday.recorded ? "参考" : ""}
          </span>
          {yesterday.recorded ? (
            <span style={{ whiteSpace: "nowrap" }}>
              <span className={styles.num} style={{ fontSize: shipping.state === "accruing" ? 32 : 42 }}>
                {yesterday.total == null ? "—" : yesterday.total.toLocaleString("ja-JP")}
              </span>{" "}
              <span className={styles.unit} style={{ fontSize: 22 }}>
                件
              </span>
            </span>
          ) : (
            <span className={styles.muted} style={{ fontSize: 22 }}>
              記録なし
            </span>
          )}
        </div>
        <div className={styles.cardFoot}>
          <Stamp state={state} stampMs={stampMs} />
        </div>
      </Body>
    </section>
  );
}

const STEPS = [
  { stage: "undecided", label: "未確定" },
  { stage: "predicted", label: "予測" },
  { stage: "accruing", label: "集計中" },
];

export function TomorrowCard({ view, state, stampMs, lastOkAt }) {
  const { tomorrow } = view;

  let main;
  if (tomorrow.stage === "accruing") {
    main = (
      <>
        <div className={styles.bigNumberRow}>
          <RollingNumber value={tomorrow.total} size={104} showDelta />
          <span className={styles.unit} style={{ fontSize: 32 }}>
            件
          </span>
        </div>
        <span className={styles.muted} style={{ fontSize: 20 }}>
          まだ増えます ・ 入力済 {tomorrow.enteredShops} / {tomorrow.shopsCount ?? "—"} 店舗
        </span>
      </>
    );
  } else if (tomorrow.stage === "predicted") {
    main = (
      <>
        <div className={styles.bigNumberRow}>
          <span style={{ fontSize: 38, fontWeight: 700, color: "#C9D2DA" }}>約</span>
          <RollingNumber value={tomorrow.predicted} size={104} style={{ color: "#C9D2DA" }} />
          <span className={styles.unit} style={{ fontSize: 32 }}>
            件
          </span>
        </div>
        <span className={styles.muted} style={{ fontSize: 20 }}>
          見込みの数です
        </span>
      </>
    );
  } else {
    main = (
      <>
        <span style={{ fontSize: 60, fontWeight: 700, color: "#A9B5C0", lineHeight: 1.1 }}>未確定</span>
        <span className={styles.muted} style={{ fontSize: 20 }}>
          いつもは午後に入力が始まります
        </span>
      </>
    );
  }

  return (
    <section className={classNames(styles.card, styles.kpiCard, cardStateClass(state))} style={{ animationDelay: "0.2s" }}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>明日の予定</h2>
        <span className={styles.cardDate}>{formatMd(tomorrow.date)}</span>
      </div>
      <Body state={state} lastOkAt={lastOkAt}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{main}</div>
        <div className={styles.stepper}>
          <span className={styles.stepperLine} />
          {STEPS.map((step) => (
            <div key={step.stage} className={classNames(styles.step, step.stage === tomorrow.stage && styles.stepCurrent)}>
              <span className={styles.stepDot} />
              <span>{step.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.cardFoot}>
          <Stamp state={state} stampMs={stampMs} />
        </div>
      </Body>
    </section>
  );
}
