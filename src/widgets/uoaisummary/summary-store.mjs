import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_KEYS = ["shipping", "attention", "sales", "performance"];
const METRIC_KEYS = new Set([
  "shipping.today_output.total",
  "shipping.active_shops",
  "shipping.shipping.total",
  "shipping.shipping.yesterday_total",
  "shipping.shipping.vs_yesterday_percent",
  "shipping.tomorrow.total",
  "attention.open_total",
  "attention.pending_orders",
  "attention.unanswered_inquiries",
  "attention.overdue_inquiries",
  "attention.unreplied_reviews",
  "attention.rating_1",
  "attention.rating_2",
  "attention.rating_3",
  "sales.realtime_yen",
  "sales.orders",
  "sales.aov_yen",
  "sales.seven_day_total_yen",
  "sales.seven_day_avg_yen",
  "sales.realtime_vs_seven_day_avg_percent",
  "sales.seven_day_orders",
  "sales.seven_day_cvr",
  "performance.traffic.visit",
  "performance.traffic.unique_visitors",
  "performance.traffic.expected_visit",
  "performance.traffic.delta_percent",
  "performance.mix.new_sales_share",
  "performance.mix.repeat_sales_share",
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
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

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
  const evidence = Array.isArray(value.evidence)
    ? value.evidence
        .map((entry) => {
          const interpretation = localized(entry?.interpretation);
          return isRecord(entry) && METRIC_KEYS.has(entry.metricKey) && interpretation
            ? { metricKey: entry.metricKey, interpretation }
            : null;
        })
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const actions = Array.isArray(value.actions)
    ? value.actions
        .map((entry) => {
          const title = localized(entry?.title);
          const reason = localized(entry?.reason);
          return isRecord(entry) &&
            ["high", "medium", "low"].includes(entry.priority) &&
            SOURCE_KEYS.includes(entry.module) &&
            (entry.shopName === null || typeof entry.shopName === "string") &&
            title &&
            reason
            ? { priority: entry.priority, module: entry.module, shopName: entry.shopName, title, reason }
            : null;
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const reviewThemes = Array.isArray(value.reviewThemes)
    ? value.reviewThemes
        .map((entry) => {
          const theme = localized(entry?.theme);
          const impact = localized(entry?.impact);
          const suggestion = localized(entry?.suggestion);
          return isRecord(entry) && theme && impact && suggestion ? { theme, impact, suggestion } : null;
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (!headline || !assessment || evidence.length < 2 || actions.length < 1) return null;
  return { headline, assessment, evidence, actions, reviewThemes };
}

function normalizeSourceCoverage(value) {
  if (!isRecord(value)) return null;
  const valid = nonNegativeIntegerOrNull(value.valid);
  const total = nonNegativeIntegerOrNull(value.total);
  return valid === null || total === null ? null : { valid, total };
}

function normalizeSourceFreshness(value) {
  if (!isRecord(value)) return null;

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

function normalizeMetricDisplay(value) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => {
        const ja = stringOrNull(entry?.ja);
        const zh = stringOrNull(entry?.zh);
        const rawValue = numberOrNull(entry?.rawValue);
        return METRIC_KEYS.has(key) && ja !== null && zh !== null && (rawValue !== null || entry?.rawValue === null)
          ? [key, { rawValue, ja, zh }]
          : null;
      })
      .filter(Boolean),
  );
}

function normalizeLatest(value) {
  if (!isRecord(value)) return null;
  const severity = ["normal", "attention", "critical", "unknown"].includes(value.severity) ? value.severity : "unknown";
  const dataQuality = ["complete", "partial", "insufficient", "stale"].includes(value.dataQuality)
    ? value.dataQuality
    : "insufficient";

  return {
    severity,
    dataQuality,
    generatedAtJST: timestampOrNull(value.generatedAtJST),
    sourceCoverage: normalizeSourceCoverage(value.sourceCoverage),
    sourceFreshness: normalizeSourceFreshness(value.sourceFreshness),
    summary: normalizeSummary(value.summary),
    metricDisplay: normalizeMetricDisplay(value.metricDisplay),
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
    version: 1,
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
  if (!value || value.version !== 1) return empty;

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
        return normalizeState(JSON.parse(readFileSync(filePath, "utf8")));
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
