import { AISummaryError } from "./errors.mjs";
import { METRIC_DEFINITIONS, metric, numberOrNull } from "./metrics.mjs";

const MAX_REVIEW_COUNT = 10;
const MAX_REVIEW_CHARS = 300;
const VALID_STATES = new Set(["fresh", "delayed"]);

function truncateChars(value, max) {
  return Array.from(String(value ?? ""))
    .slice(0, max)
    .join("");
}

function compactText(value, max) {
  const text = String(value ?? "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return truncateChars(text, max);
}

function safeTimestamp(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? JST$/.test(text) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)
    ? text
    : null;
}

export function sanitizeReview(review) {
  const numericRating = Number(review?.rating);
  return {
    shopName: compactText(review?.shopName, 80) || null,
    rating: Number.isInteger(numericRating) && numericRating >= 1 && numericRating <= 5 ? numericRating : null,
    postedAtJST: safeTimestamp(review?.postedAtJST),
    itemManagementNumber: compactText(review?.itemManagementNumber, 80) || null,
    excerpt: compactText(review?.excerpt, MAX_REVIEW_CHARS),
  };
}

function dataQuality(collected, validCount) {
  if (validCount < 2) return "insufficient";
  const anyPartial = Object.values(collected).some((source) => source.partial === true);
  return validCount < 4 || anyPartial ? "partial" : "complete";
}

function severity(collected, validCount) {
  if (validCount < 2) return "unknown";
  const statuses = [
    VALID_STATES.has(collected.attention?.state) ? collected.attention?.data?.status : null,
    VALID_STATES.has(collected.performance?.state) ? collected.performance?.data?.traffic?.status : null,
  ];
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("attention")) return "attention";
  // An unreadable status source cannot support an all-clear, only an escalation.
  return statuses.includes(null) ? "unknown" : "normal";
}

function safeText(value, max = 160) {
  const text = compactText(value, max);
  return text || null;
}

function parseJST(value) {
  const parsed = Date.parse(
    String(value || "")
      .replace(" JST", "+09:00")
      .replace(" ", "T"),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function formatJST(timestamp) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return (
    values.year +
    "-" +
    values.month +
    "-" +
    values.day +
    " " +
    values.hour +
    ":" +
    values.minute +
    ":" +
    values.second +
    " JST"
  );
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

const SEVERITY_RANK = { critical: 2, attention: 1 };
const MAX_ATTENTION_SHOPS = 5;

function abnormal(status) {
  return status === "critical" || status === "attention";
}

function buildAttentionShops(collected) {
  const attentionRows = VALID_STATES.has(collected.attention?.state) ? collected.attention.data?.shops || [] : [];
  const performanceRows = VALID_STATES.has(collected.performance?.state)
    ? collected.performance.data?.shops || []
    : [];
  const salesByName = new Map(
    (VALID_STATES.has(collected.sales?.state) ? collected.sales.data?.sales?.shops || [] : [])
      .map((shop) => [safeText(shop.shopName, 80), shop])
      .filter(([name]) => name),
  );

  const merged = new Map();
  const upsert = (name, rank) => {
    const existing = merged.get(name) || {
      shopName: name,
      rank: 0,
      issues: [],
      pendingOrderCount: null,
      unansweredInquiryCount: null,
      overdueInquiryCount: null,
      unrepliedReviewCount: null,
      visitDeltaPercent: null,
    };
    existing.rank = Math.max(existing.rank, rank);
    merged.set(name, existing);
    return existing;
  };

  for (const shop of attentionRows) {
    const name = safeText(shop.shopName, 80);
    if (!name || !abnormal(shop.status)) continue;
    const entry = upsert(name, SEVERITY_RANK[shop.status]);
    entry.pendingOrderCount = numberOrNull(shop.pendingOrderCount);
    entry.unansweredInquiryCount = numberOrNull(shop.unansweredInquiryCount);
    entry.overdueInquiryCount = numberOrNull(shop.overdueInquiryCount);
    entry.unrepliedReviewCount = numberOrNull(shop.unrepliedReviewCount);
    if (entry.pendingOrderCount > 0) entry.issues.push("orders");
    if (entry.unansweredInquiryCount > 0 || entry.overdueInquiryCount > 0) entry.issues.push("inquiries");
    if (entry.unrepliedReviewCount > 0) entry.issues.push("reviews");
  }

  for (const shop of performanceRows) {
    const name = safeText(shop.shopName, 80);
    if (!name || !abnormal(shop.traffic?.status)) continue;
    const entry = upsert(name, SEVERITY_RANK[shop.traffic.status]);
    entry.visitDeltaPercent =
      Number(shop.traffic?.sampleCount) >= 3 ? numberOrNull(shop.traffic?.visitDeltaPercent) : null;
    entry.issues.push("traffic");
  }

  return [...merged.values()]
    .sort((left, right) => right.rank - left.rank || (left.shopName < right.shopName ? -1 : 1))
    .slice(0, MAX_ATTENTION_SHOPS)
    .map(({ rank, ...entry }) => ({
      ...entry,
      issues: [...new Set(entry.issues)],
      salesYen: numberOrNull(salesByName.get(entry.shopName)?.salesYen),
    }));
}

const MAX_MODEL_INPUT_BYTES = 16000;

export function shrinkToBudget(modelInput) {
  if (byteLength(modelInput) <= MAX_MODEL_INPUT_BYTES) return;
  modelInput.metrics = modelInput.metrics.map(({ key, source, value, unit, note }) => ({
    key,
    source,
    value,
    unit,
    note,
  }));
  if (byteLength(modelInput) <= MAX_MODEL_INPUT_BYTES) return;
  modelInput.attentionShops = modelInput.attentionShops.slice(0, 3);
  if (byteLength(modelInput) <= MAX_MODEL_INPUT_BYTES) return;
  modelInput.reviewSamples = modelInput.reviewSamples.slice(0, 5);
  if (byteLength(modelInput) > MAX_MODEL_INPUT_BYTES) {
    throw new AISummaryError("source_unavailable", "Normalized AI input exceeds safe size");
  }
}

export function buildAnalysisInput(collected, { previousSnapshot, nowTs }) {
  const previousMetrics = previousSnapshot?.metrics || {};
  const sourceFreshness = Object.fromEntries(
    ["shipping", "attention", "sales", "performance"].map((key) => [
      key,
      {
        state: collected[key]?.state || "unavailable",
        updatedAtJST: collected[key]?.updatedAtJST || null,
      },
    ]),
  );
  const validCount = Object.values(collected).filter((source) => VALID_STATES.has(source?.state)).length;
  const metrics = Object.fromEntries(
    METRIC_DEFINITIONS.filter(([, source]) => VALID_STATES.has(collected[source]?.state)).map(
      ([key, source, read, unit, noteRead]) => [
        key,
        metric(
          key,
          source,
          read(collected[source].data),
          unit,
          previousMetrics,
          noteRead ? noteRead(collected[source].data) : null,
        ),
      ],
    ),
  );
  const previousTs = parseJST(previousSnapshot?.capturedAtJST);
  const comparisonWindow =
    previousTs === null
      ? null
      : {
          previousCapturedAtJST: previousSnapshot.capturedAtJST,
          elapsedMinutes: Math.max(0, Math.round((nowTs - previousTs) / 60000)),
          isHourly: Math.abs(nowTs - previousTs - 3600000) <= 15 * 60000,
        };
  const reviewSamples = (
    VALID_STATES.has(collected.attention?.state) ? collected.attention?.data?.recentReviews || [] : []
  )
    .filter((review) => {
      const rating = Number(review.rating);
      return Number.isInteger(rating) && rating >= 1 && rating <= 3;
    })
    .sort(
      (left, right) =>
        Number(left.rating) - Number(right.rating) || String(right.postedAtJST).localeCompare(String(left.postedAtJST)),
    )
    .slice(0, MAX_REVIEW_COUNT)
    .map(sanitizeReview);
  const sourceCoverage = { valid: validCount, total: 4 };
  const quality = dataQuality(collected, validCount);
  const level = severity(collected, validCount);
  const modelInput = {
    capturedAtJST: formatJST(nowTs),
    severity: level,
    dataQuality: quality,
    sourceCoverage,
    sourceFreshness,
    metrics: Object.values(metrics),
    attentionShops: buildAttentionShops(collected),
    reviewSamples,
    comparisonWindow,
    caveats: ["NO_INTRADAY_SALES_BASELINE"],
  };
  if (comparisonWindow && !comparisonWindow.isHourly) {
    modelInput.caveats.push("PREVIOUS_SNAPSHOT_INTERVAL_IS_NOT_ONE_HOUR");
  }

  shrinkToBudget(modelInput);

  const snapshot = {
    capturedAtJST: modelInput.capturedAtJST,
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, entry]) => [key, entry.value])),
  };
  return {
    severity: level,
    dataQuality: quality,
    sourceCoverage,
    sourceFreshness,
    comparisonWindow,
    metrics,
    modelInput,
    snapshot,
  };
}
