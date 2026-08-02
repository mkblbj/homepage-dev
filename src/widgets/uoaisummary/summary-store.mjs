import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATE_VERSION = 2;
const SOURCE_KEYS = ["shipping", "attention", "sales", "performance"];
const METRIC_KEYS = new Set([
  "shipping.today_output.total",
  "shipping.active_shops",
  "shipping.tomorrow.total",
  "attention.open_total",
  "attention.pending_orders",
  "attention.unanswered_inquiries",
  "attention.overdue_inquiries",
  "attention.unreplied_reviews",
  "sales.realtime_yen",
  "sales.orders",
  "sales.aov_yen",
  "sales.realtime_vs_seven_day_avg_percent",
  "performance.traffic.visit",
  "performance.traffic.delta_percent",
  "performance.mix.new_sales_share",
]);
const ERROR_CODES = new Set([
  "configuration",
  "source_timeout",
  "source_unavailable",
  "model_timeout",
  "model_http",
  "model_schema",
  "cache",
  "unexpected",
]);
const JST_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? JST$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function timestampOrNull(value) {
  return typeof value === "string" && (JST_TIMESTAMP.test(value) || ISO_TIMESTAMP.test(value)) ? value : null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeIntegerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function localized(value) {
  if (!isRecord(value)) return null;
  const ja = stringOrNull(value.ja);
  const zh = stringOrNull(value.zh);
  return ja === null || zh === null ? null : { ja, zh };
}

function normalizeSummary(value) {
  if (!isRecord(value)) return null;

  const headline = localized(value.headline);
  const assessment = localized(value.assessment);
  const actions = Array.isArray(value.actions)
    ? value.actions
        .map((entry) => {
          const title = localized(entry?.title);
          const reason = localized(entry?.reason);
          return isRecord(entry) &&
            ["high", "medium", "low"].includes(entry.priority) &&
            SOURCE_KEYS.includes(entry.module) &&
            (entry.shopName === null || typeof entry.shopName === "string") &&
            (entry.metricKey === null || METRIC_KEYS.has(entry.metricKey)) &&
            title &&
            reason
            ? {
                priority: entry.priority,
                module: entry.module,
                shopName: entry.shopName,
                metricKey: entry.metricKey,
                title,
                reason,
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (!headline || !assessment || actions.length < 1) return null;
  return { headline, assessment, actions };
}

function normalizeSourceCoverage(value) {
  if (!isRecord(value)) return null;
  const valid = nonNegativeIntegerOrNull(value.valid);
  const total = nonNegativeIntegerOrNull(value.total);
  return valid === null || total === null ? null : { valid, total };
}

function normalizeSourceFreshness(value) {
  if (
    !isRecord(value) ||
    SOURCE_KEYS.some(
      (key) =>
        !Object.prototype.hasOwnProperty.call(value, key) ||
        !isRecord(value[key]) ||
        !["fresh", "delayed", "stale", "unavailable"].includes(value[key].state),
    )
  ) {
    return null;
  }

  return Object.fromEntries(
    SOURCE_KEYS.map((key) => {
      const source = value[key];
      const state =
        typeof source?.state === "string" && ["fresh", "delayed", "stale", "unavailable"].includes(source.state)
          ? source.state
          : "unavailable";
      return [key, { state, updatedAtJST: timestampOrNull(source?.updatedAtJST) }];
    }),
  );
}

const METRIC_UNITS = new Set(["count", "yen", "percent"]);
const METRIC_NOTES = new Set(["actual", "predicted", "yesterday"]);

function normalizeMetrics(value) {
  if (!Array.isArray(value)) return [];

  const byKey = new Map();
  for (const entry of value) {
    if (!isRecord(entry) || !METRIC_KEYS.has(entry.key) || !METRIC_UNITS.has(entry.unit)) continue;
    byKey.set(entry.key, {
      key: entry.key,
      unit: entry.unit,
      value: numberOrNull(entry.value),
      previousValue: numberOrNull(entry.previousValue),
      delta: numberOrNull(entry.delta),
      deltaPercent: numberOrNull(entry.deltaPercent),
      note: METRIC_NOTES.has(entry.note) ? entry.note : null,
    });
  }
  return [...byKey.values()];
}

function normalizeLatest(value) {
  if (!isRecord(value)) return null;
  const severity = ["normal", "attention", "critical", "unknown"].includes(value.severity) ? value.severity : null;
  const dataQuality = ["complete", "partial", "insufficient", "stale"].includes(value.dataQuality)
    ? value.dataQuality
    : null;
  const generatedAtJST = timestampOrNull(value.generatedAtJST);
  const sourceCoverage = normalizeSourceCoverage(value.sourceCoverage);
  const sourceFreshness = normalizeSourceFreshness(value.sourceFreshness);
  const summary = normalizeSummary(value.summary);
  if (
    severity === null ||
    dataQuality === null ||
    generatedAtJST === null ||
    sourceCoverage === null ||
    sourceCoverage.total !== 4 ||
    sourceCoverage.valid > sourceCoverage.total ||
    sourceFreshness === null ||
    summary === null
  ) {
    return null;
  }

  return {
    severity,
    dataQuality,
    generatedAtJST,
    sourceCoverage,
    sourceFreshness,
    summary,
    metrics: normalizeMetrics(value.metrics),
  };
}

function normalizeSnapshot(value) {
  if (!isRecord(value)) return null;
  const capturedAtJST = timestampOrNull(value.capturedAtJST);
  if (capturedAtJST === null || !isRecord(value.metrics)) return null;

  const metrics = Object.fromEntries(
    Object.entries(value.metrics)
      .map(([key, metricValue]) =>
        METRIC_KEYS.has(key) && (numberOrNull(metricValue) !== null || metricValue === null)
          ? [key, numberOrNull(metricValue)]
          : null,
      )
      .filter(Boolean),
  );
  return { capturedAtJST, metrics };
}

function normalizeUsage(value) {
  if (!isRecord(value)) return null;
  const usage = Object.fromEntries(
    ["input_tokens", "output_tokens", "total_tokens"]
      .map((key) => {
        const count = nonNegativeIntegerOrNull(value[key]);
        return count === null ? null : [key, count];
      })
      .filter(Boolean),
  );
  return Object.keys(usage).length ? usage : null;
}

export function emptySummaryState() {
  return {
    version: STATE_VERSION,
    latest: null,
    snapshots: [],
    lastAttemptAtJST: null,
    manualCooldownUntilJST: null,
    nextScheduledAtJST: null,
    lastError: null,
    usage: null,
  };
}

export function getSummaryStorePath(configDir) {
  return join(configDir, "uo-ai-summary.json");
}

function normalizeState(value) {
  const empty = emptySummaryState();
  if (!value || value.version !== STATE_VERSION) return empty;

  return {
    ...empty,
    latest: normalizeLatest(value.latest),
    snapshots: Array.isArray(value.snapshots) ? value.snapshots.map(normalizeSnapshot).filter(Boolean).slice(-24) : [],
    lastAttemptAtJST: timestampOrNull(value.lastAttemptAtJST),
    manualCooldownUntilJST: timestampOrNull(value.manualCooldownUntilJST),
    nextScheduledAtJST: timestampOrNull(value.nextScheduledAtJST),
    lastError: ERROR_CODES.has(value.lastError) ? value.lastError : null,
    usage: normalizeUsage(value.usage),
  };
}

export function appendSnapshot(state, snapshot, limit = 24) {
  const normalized = normalizeState(state);
  const compactSnapshot = normalizeSnapshot(snapshot);
  const snapshotLimit = Number.isInteger(limit) && limit > 0 ? limit : 24;
  return {
    ...normalized,
    snapshots: compactSnapshot
      ? [...normalized.snapshots, compactSnapshot].slice(-snapshotLimit)
      : normalized.snapshots,
  };
}

export function createSummaryStore({ configDir, now = Date.now }) {
  const filePath = getSummaryStorePath(configDir);

  return {
    read() {
      if (!existsSync(filePath)) return emptySummaryState();

      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        if (!parsed || parsed.version !== STATE_VERSION) return emptySummaryState();
        const state = normalizeState(parsed);
        if (parsed.latest !== null && parsed.latest !== undefined && state.latest === null) {
          throw new Error("Invalid cached summary");
        }
        return state;
      } catch {
        renameSync(filePath, `${filePath}.corrupt-${now()}`);
        return emptySummaryState();
      }
    },
    write(value) {
      mkdirSync(configDir, { recursive: true });
      const state = normalizeState(value);
      const tempPath = `${filePath}.${process.pid}.${now()}.tmp`;
      writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
      renameSync(tempPath, filePath);
      return state;
    },
  };
}
