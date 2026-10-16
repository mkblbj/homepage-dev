import { jstTimeFromIso } from "./tv-time.mjs";

// Blues for the courier mix, assigned by rank (largest first) so the bar reads as one family.
export const BAR_SHADES = ["#4C93E0", "#8BBCF0", "#2C62A3", "#C3DBF7", "#E8F1FB"];

// A count the board may show: a finite number, or null when the source does not say.
function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The upstream list has "ゆうパケット 3CM)" with its opening bracket missing.
export function cleanCourierName(name) {
  const text = String(name ?? "").trim();
  return text.replace(/^(ゆうパケット)\s+(\d+CM)\)$/, "$1 ($2)");
}

function hasRecords(section) {
  return Number(section?.record_count) > 0 || (Array.isArray(section?.couriers) && section.couriers.length > 0);
}

function firstRecordedAt(section) {
  const times = (section?.records || [])
    .map((record) => record?.created_at)
    .filter(Boolean)
    .sort();
  return times.length ? jstTimeFromIso(times[0]) : null;
}

function courierItems(section) {
  return (section?.couriers || [])
    .map((courier) => ({ name: cleanCourierName(courier.courier_name), qty: count(courier.total_quantity) }))
    .filter((courier) => courier.qty > 0)
    .sort((a, b) => b.qty - a.qty);
}

const UNKNOWN = {
  updatedAt: null,
  output: { date: null, total: null, yesterdayTotal: null, yesterdayDate: null },
  shipping: {
    date: null,
    state: "unknown",
    total: null,
    firstAt: null,
    yesterday: { date: null, total: null, recorded: false, recordedAt: null },
  },
  tomorrow: { date: null, stage: "unknown", total: null, predicted: null, enteredShops: 0, shopsCount: null },
  couriers: { scope: "yesterday", date: null, recorded: false, total: null, items: [] },
};

export function buildShippingView(data) {
  if (!data || typeof data !== "object" || data.error) {
    return structuredClone(UNKNOWN);
  }

  const todayShipping = data.today_shipping;
  const yesterdayShipping = data.yesterday_shipping;
  const todayRecorded = hasRecords(todayShipping);
  const yesterdayRecorded = hasRecords(yesterdayShipping);

  const tomorrowOutput = data.tomorrow_output;
  const tomorrowTotal = count(tomorrowOutput?.total_quantity);
  const tomorrowPredicted = count(tomorrowOutput?.total_predicted_quantity);
  let stage = "undecided";
  if (!tomorrowOutput) stage = "unknown";
  else if (tomorrowTotal > 0) stage = "accruing";
  else if (tomorrowPredicted > 0) stage = "predicted";

  const courierSource = todayRecorded ? todayShipping : yesterdayShipping;
  const courierRecorded = todayRecorded || yesterdayRecorded;

  return {
    updatedAt: data.updated_at ?? null,
    output: {
      date: data.today_output?.date ?? null,
      total: count(data.today_output?.total_quantity),
      yesterdayTotal: count(data.yesterday_output?.total_quantity),
      yesterdayDate: data.yesterday_output?.date ?? null,
    },
    shipping: {
      date: todayShipping?.date ?? null,
      state: todayShipping ? (todayRecorded ? "accruing" : "pending") : "unknown",
      total: todayRecorded ? count(todayShipping.total_quantity) : null,
      firstAt: todayRecorded ? firstRecordedAt(todayShipping) : null,
      yesterday: {
        date: yesterdayShipping?.date ?? null,
        total: yesterdayRecorded ? count(yesterdayShipping.total_quantity) : null,
        recorded: yesterdayRecorded,
        recordedAt: yesterdayRecorded ? firstRecordedAt(yesterdayShipping) : null,
      },
    },
    tomorrow: {
      date: tomorrowOutput?.date ?? null,
      stage,
      total: stage === "accruing" ? tomorrowTotal : null,
      predicted: stage === "predicted" ? tomorrowPredicted : null,
      enteredShops: (tomorrowOutput?.shops || []).filter((shop) => shop?.has_data === true).length,
      shopsCount: count(tomorrowOutput?.shops_count),
    },
    couriers: {
      scope: todayRecorded ? "today" : "yesterday",
      date: courierSource?.date ?? null,
      recorded: courierRecorded,
      total: courierRecorded ? count(courierSource?.total_quantity) : null,
      items: courierRecorded ? courierItems(courierSource) : [],
    },
  };
}
