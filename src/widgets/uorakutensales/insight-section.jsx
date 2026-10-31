// 「分析・深掘り」 pieces that come from the performance snapshot: the
// new / repeat mix of the last 7 days, and visits shop by shop. Both reuse the
// 経営表現 widget's wording, since they show the same figures it did.
import { DASH, mdLabel } from "widgets/uoperformance/performance-model.mjs";

import { Delta, ShopName, visitDayLabel, visitsStale } from "./daily-check-section";
import { PlatformName, ScopeName } from "./platform-mark";
import { FALLBACK_SHOP_COLOR } from "./sales-model.mjs";

const NS = "uorakutensales";
const PERF = "uoperformance";
const MUTED = "text-theme-600 dark:text-theme-300";

function fmt(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

function periodLabel(period) {
  return period?.startDateJST && period?.endDateJST
    ? `${mdLabel(period.startDateJST)}–${mdLabel(period.endDateJST)}`
    : "";
}

function pctText(value) {
  return value === null || value === undefined ? DASH : `${Number(value).toFixed(1)}%`;
}

// `scope` names the platform the mix belongs to once the board shows several
export function CustomerMixCard({ performance, scope = "", cardCls = "", t }) {
  const mix = performance?.mix;
  if (!mix || mix.newYen === null) return null;
  const rows = [
    { key: "new", label: t(`${PERF}.newCustomers`), yen: mix.newYen, orders: mix.newOrders, color: "#2E7DF6" },
    ...mix.buckets.map((b) => ({
      key: b.key,
      label: t(`${PERF}.bucket.${b.key}`),
      yen: b.yen,
      orders: b.orders,
      color: b.color,
    })),
  ];
  const total = (mix.newYen || 0) + (mix.repYen || 0);
  const max = Math.max(1, ...rows.map((r) => r.yen || 0));
  return (
    <section className={`flex min-w-0 flex-col gap-3 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-base font-extrabold text-theme-900 dark:text-theme-50">
          <ScopeName scope={scope} />
          {t(`${PERF}.mixTitle`)}
        </span>
        <span className={`text-xs ${MUTED}`}>
          {periodLabel(mix.period)} · {t(`${NS}.sortSales`)}
        </span>
      </span>
      <span className="flex h-8 overflow-hidden rounded-lg text-xs font-extrabold">
        <span
          className="flex items-center whitespace-nowrap bg-[#2E7DF6] px-3 text-white"
          style={{ width: `${mix.newSalesShare ?? 0}%` }}
        >
          {t(`${PERF}.newCustomers`)} {pctText(mix.newSalesShare)}
        </span>
        <span
          className="flex items-center justify-center whitespace-nowrap bg-[#9DB9EA] text-theme-900"
          style={{ width: `${mix.repSalesShare ?? 0}%` }}
        >
          {pctText(mix.repSalesShare)}
        </span>
      </span>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[112px_minmax(0,1fr)_96px_52px_60px] items-center gap-3 text-sm">
            <span className="font-semibold text-theme-800 dark:text-theme-100">{r.label}</span>
            <span className="block h-2 overflow-hidden rounded-full bg-theme-400/40 dark:bg-white/10">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(1, ((r.yen || 0) / max) * 100)}%`, backgroundColor: r.color }}
              />
            </span>
            <span className="text-right font-bold tabular-nums text-theme-900 dark:text-theme-50">
              {r.yen === null ? DASH : `¥${fmt(t, r.yen)}`}
            </span>
            <span className={`text-right tabular-nums ${MUTED}`}>
              {total > 0 && r.yen !== null ? pctText((r.yen / total) * 100) : DASH}
            </span>
            <span className={`text-right text-xs tabular-nums ${MUTED}`}>
              {r.orders === null ? DASH : `${fmt(t, r.orders)}${t(`${NS}.ordersUnit`)}`}
            </span>
          </div>
        ))}
      </div>
      <span className={`text-xs ${MUTED}`}>{t(`${PERF}.mixCaveat`)}</span>
    </section>
  );
}

// a shop the snapshot does not cover keeps its line, read as dashes
function unknownShop(name) {
  return { name, visit: null, uu: null, expected: null, delta: null, sampleCount: 0, newSalesShare: null };
}

// `shops` are the shop table's rows, so both tables list shops in the same order.
// Visits and logos are 楽天's: a shop of another platform reads as dashes even
// when it shares a 楽天 shop's name (3911 on au PAY). `scope` names whose visits
// the total is once the board shows several platforms.
export function ShopVisitsTable({
  performance,
  shops,
  shopColors,
  logoByName = new Map(),
  scope = "",
  cardCls = "",
  t,
}) {
  if (!performance) return null;
  const byName = new Map(performance.shops.map((s) => [s.name, s]));
  const isRakuten = (shop) => !shop.platform || shop.platform === "rakuten";
  const rows = shops.map((shop) => ({
    ...(isRakuten(shop) ? (byName.get(shop.name) ?? unknownShop(shop.name)) : unknownShop(shop.name)),
    key: shop.key ?? shop.name,
    platform: shop.platform ?? "rakuten",
  }));
  const listed = new Set(shops.filter(isRakuten).map((shop) => shop.name));
  const omitted = performance.shops.filter((s) => !listed.has(s.name)).map((s) => s.name);
  const companyDelta = performance.sampleCount >= 3 ? performance.delta : null;
  const cell = "px-2 py-2 text-right text-sm tabular-nums";
  const headBase = "px-2 py-2 text-xs font-semibold text-theme-600 dark:text-theme-300";
  const head = `${headBase} text-right`;
  return (
    <section className={`flex min-w-0 flex-col gap-3 p-5 ${cardCls}`}>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-base font-extrabold text-theme-900 dark:text-theme-50">{t(`${NS}.shopVisits`)}</span>
        <span className={`text-xs ${MUTED}`}>
          {visitDayLabel(performance.dataDateJST)} ·{" "}
          {visitsStale(performance) ? (
            <span className="text-amber-700 dark:text-amber-300">{t(`${NS}.visitsStale`)}</span>
          ) : (
            t(`${NS}.confirmed`)
          )}
        </span>
      </span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-theme-300/50 dark:border-white/10">
              <th scope="col" className={`${headBase} text-left`}>
                {t(`${NS}.colShop`)}
              </th>
              <th scope="col" className={head}>
                {t(`${NS}.visits`)}
              </th>
              <th scope="col" className={head}>
                UU
              </th>
              <th scope="col" className={head}>
                {t(`${PERF}.median`)}
              </th>
              <th scope="col" className={head}>
                {t(`${NS}.vsMedian`)}
              </th>
              <th scope="col" className={head}>
                {t(`${PERF}.newShare`)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key} className="border-b border-theme-300/30 dark:border-white/[0.07]">
                <th scope="row" className="px-2 py-2 text-left text-sm">
                  <ShopName
                    name={s.name}
                    color={shopColors[s.name] ?? FALLBACK_SHOP_COLOR}
                    logoUrl={s.platform === "rakuten" ? logoByName.get(s.name) : undefined}
                    platform={s.platform}
                    t={t}
                  />
                </th>
                <td className={`${cell} font-bold text-theme-900 dark:text-theme-50`}>
                  {s.visit === null ? DASH : fmt(t, s.visit)}
                </td>
                <td className={`${cell} ${MUTED}`}>{s.uu === null ? DASH : fmt(t, s.uu)}</td>
                <td className={`${cell} ${MUTED}`}>{s.expected === null ? DASH : fmt(t, s.expected)}</td>
                <td className={cell}>
                  <Delta value={s.sampleCount >= 3 ? s.delta : null} />
                </td>
                <td className={`${cell} ${MUTED}`}>{pctText(s.newSalesShare)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-theme-300/70 font-bold dark:border-white/20">
              <th scope="row" className="px-2 py-2 text-left text-sm text-theme-900 dark:text-theme-50">
                {scope ? (
                  <PlatformName platform="rakuten" label={t(`${NS}.platformTotal`, { platform: scope })} />
                ) : (
                  t(`${NS}.total`)
                )}
              </th>
              <td className={`${cell} text-theme-900 dark:text-theme-50`}>
                {performance.visit === null ? DASH : fmt(t, performance.visit)}
              </td>
              <td className={`${cell} ${MUTED}`}>{performance.uu === null ? DASH : fmt(t, performance.uu)}</td>
              <td className={`${cell} ${MUTED}`}>
                {performance.expected === null ? DASH : fmt(t, performance.expected)}
              </td>
              <td className={cell}>
                <Delta value={companyDelta} />
              </td>
              <td className={`${cell} ${MUTED}`}>{pctText(performance.mix.newSalesShare)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <span className={`text-xs ${MUTED}`}>
        {t(`${NS}.visitsNote`)}
        {omitted.length ? ` · ${t(`${NS}.idleLeftOut`, { names: omitted.join("・") })}` : ""}
      </span>
    </section>
  );
}
