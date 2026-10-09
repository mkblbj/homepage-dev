/*
 * 内訳 — the panel under a model on the device board: our own products behind
 * its figures in the board's scope (period, shop, category and case style),
 * ordered by the metric on screen, each with how its model and its case style
 * were recognized. The scope's figures are the server's summary.
 */
import { useState } from "react";

import { rankDeviceEvidence } from "./device-evidence-model.mjs";
import { DEVICE_METRICS } from "./device-sales-model.mjs";
import { metricText, MUTED, NS, press, VALUE_TONE } from "./device-sales-row";

// the first products carry most of a model; the rest open on demand
const PREVIEW = 10;
const STYLE_NAME = { folio: "styleFolio", standard: "styleStandard", unknown: "styleUnknown" };
const STYLE_SOURCE = {
  "verified-series": "sourceSeries",
  title: "sourceTitle",
  "same-shop-product-history": "sourceHistory",
  unresolved: "sourceUnresolved",
};
const RULE = { "missing-case-style": "ruleMissingStyle", "conflicting-product-history": "ruleConflictingHistory" };
const CHIP =
  "rounded border border-theme-300/60 px-1.5 py-px text-[10px] font-semibold text-theme-700 dark:border-theme-600/60 dark:text-theme-200";

// an order's model choice, an SKU attribute, or the title
function deviceSourceKey(device) {
  if (device.source === "selection") return device.option?.source === "sku" ? "sourceSku" : "sourceSelection";
  return device.source === "title" ? "sourceTitle" : null;
}

function label(t, key, fallback) {
  return key ? t(`${NS}.${key}`) : (fallback ?? "—");
}

// "機種: 選択肢 ●iPhone シリ-ズ = iPhone 17"
function deviceChip(device, t) {
  const source = label(t, deviceSourceKey(device), device.source);
  const option = device.option ? ` ${device.option.key} = ${device.option.value}` : "";
  return `${t(`${NS}.ownEvidenceModel`)}: ${source}${option}`;
}

// "手帳型: シリーズ「102」", "タイプ不明: 判定不可 タイプの記載なし"
function styleChip(style, t) {
  const name = label(t, STYLE_NAME[style.key], style.key);
  const source = label(t, STYLE_SOURCE[style.source], style.source);
  let detail = "";
  if (style.source === "unresolved") detail = RULE[style.rule] ? ` ${t(`${NS}.${RULE[style.rule]}`)}` : "";
  else if (style.text) detail = t(`${NS}.quoted`, { text: style.text });
  return `${name}: ${source}${detail}`;
}

// "選択肢 2 · タイトル 2", most rows first
function basisLine(counts, keyOf, t) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${label(t, keyOf(source), source)} ${n}`)
    .join(" · ");
}

function Figures({ figures, metric, t }) {
  return DEVICE_METRICS.map((m, i) => (
    <span key={m}>
      {i > 0 ? <span className={MUTED}> · </span> : null}
      <span className={m === metric ? `font-extrabold ${VALUE_TONE}` : MUTED}>{metricText(m, figures[m], t)}</span>
    </span>
  ));
}

function EvidenceRow({ row, metric, t }) {
  return (
    <li
      data-testid="own-evidence-row"
      className="flex min-w-0 flex-col gap-0.5 rounded-md px-1.5 py-1 hover:bg-theme-300/20 dark:hover:bg-white/[0.04]"
    >
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11px]">
        <span data-testid="own-evidence-shop" className="shrink-0 font-bold text-theme-900 dark:text-theme-50">
          {row.shop}
        </span>
        <span title={row.itemNumber} className={`min-w-0 truncate font-mono text-[10px] ${MUTED}`}>
          {row.itemNumber}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          <Figures figures={row} metric={metric} t={t} />
        </span>
      </span>
      {row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          title={row.title}
          // the widget sits inside a clickable service card: open the page, not the card
          onClick={(e) => e.stopPropagation()}
          className="truncate text-[11px] text-theme-800 underline-offset-2 hover:underline dark:text-theme-100"
        >
          {row.title}
        </a>
      ) : (
        <span title={row.title} className="truncate text-[11px] text-theme-800 dark:text-theme-100">
          {row.title}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1">
        <span className={CHIP}>{deviceChip(row.device, t)}</span>
        {row.style ? (
          <span className={CHIP} title={row.style.history ?? undefined}>
            {styleChip(row.style, t)}
          </span>
        ) : null}
        {row.style?.example ? (
          <a
            href={row.style.example}
            target="_blank"
            rel="noopener noreferrer"
            // the widget sits inside a clickable service card: open the page, not the card
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-200"
          >
            {t(`${NS}.ownEvidenceExample`)}↗
          </a>
        ) : null}
      </span>
    </li>
  );
}

export default function OwnEvidence({ evidence, metric, t }) {
  const [all, setAll] = useState(false);
  const ready = evidence.status === "ready" && evidence.rows.length > 0;
  let message = null;
  if (evidence.status === "loading") message = "ownEvidenceLoading";
  else if (evidence.status === "failed") message = "ownEvidenceFailed";
  else if (!ready) message = "ownEvidenceNone";
  const ranked = ready ? rankDeviceEvidence(evidence.rows, metric) : [];
  const shown = all ? ranked : ranked.slice(0, PREVIEW);
  return (
    <li
      data-testid="own-evidence"
      className="mx-1 mb-1 flex min-w-0 flex-col gap-1.5 rounded-md bg-theme-900/5 px-2.5 py-2 dark:bg-white/5"
    >
      {message ? (
        <span className={`text-[11px] ${MUTED}`}>{t(`${NS}.${message}`)}</span>
      ) : (
        <>
          <span className="flex flex-wrap items-baseline gap-x-2 text-[10.5px]">
            <span className="font-bold text-theme-800 dark:text-theme-100">
              {t(`${NS}.ownEvidenceTitle`, { count: evidence.total })}
            </span>
            <span className={`tabular-nums ${MUTED}`}>
              {DEVICE_METRICS.map((m) => metricText(m, evidence.summary[m], t)).join(" · ")}
            </span>
          </span>
          <span className={`flex flex-col text-[10px] ${MUTED}`}>
            <span>
              {t(`${NS}.ownEvidenceModel`)}{" "}
              {basisLine(evidence.basis.device, (source) => deviceSourceKey({ source }), t)}
            </span>
            {Object.keys(evidence.basis.style).length > 0 ? (
              <span>
                {t(`${NS}.styleGroup`)} {basisLine(evidence.basis.style, (source) => STYLE_SOURCE[source], t)}
              </span>
            ) : null}
          </span>
          <ol className="flex flex-col gap-1">
            {shown.map((row) => (
              <EvidenceRow key={row.id} row={row} metric={metric} t={t} />
            ))}
          </ol>
          {ranked.length > PREVIEW ? (
            <button
              type="button"
              onClick={press(() => setAll((open) => !open))}
              className={`self-start text-[10.5px] font-bold hover:underline ${MUTED}`}
            >
              {all ? t(`${NS}.showLess`) : t(`${NS}.showMore`, { count: ranked.length - PREVIEW })}
            </button>
          ) : null}
          {evidence.more ? (
            <span className={`text-[10px] ${MUTED}`}>
              {t(`${NS}.ownEvidenceMore`, { count: evidence.rows.length })}
            </span>
          ) : null}
        </>
      )}
    </li>
  );
}
