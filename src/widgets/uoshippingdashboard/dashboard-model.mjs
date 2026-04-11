const SECTION_ORDER = ["today-output", "yesterday-shipping", "today-shipping", "tomorrow-output"];
const COMPACT_EMPTY_SECTIONS = new Set(["today-shipping", "tomorrow-output"]);

export function normalizeCategoryName(categoryName) {
  return String(categoryName || "").trim();
}

export function sortByQuantityThenName(a, b, nameKey) {
  const quantityDiff = Number(b?.total_quantity || 0) - Number(a?.total_quantity || 0);
  if (quantityDiff !== 0) {
    return quantityDiff;
  }

  return String(a?.[nameKey] || "").localeCompare(String(b?.[nameKey] || ""), "ja");
}

export function normalizeShops(section) {
  if (!Array.isArray(section?.shops)) {
    return [];
  }

  return [...section.shops]
    .filter((shop) => Number(shop?.total_quantity || 0) > 0)
    .sort((a, b) => sortByQuantityThenName(a, b, "shop_name"));
}

export function normalizeCouriers(section) {
  if (!Array.isArray(section?.couriers)) {
    return [];
  }

  return [...section.couriers]
    .filter((courier) => Number(courier?.total_quantity || 0) > 0)
    .sort((a, b) => sortByQuantityThenName(a, b, "courier_name"));
}

function createMetric(id, label, value, formatNumber) {
  return {
    id,
    label,
    value: formatNumber(value),
  };
}

function createSection({ id, title, date, items, kind, statLabel, statValue, emptyMessageKey, emptyHintKey = null }) {
  return {
    id,
    title,
    date: date ?? null,
    items,
    kind,
    statLabel,
    statValue,
    emptyMessageKey,
    emptyHintKey,
    emptyVariant: COMPACT_EMPTY_SECTIONS.has(id) ? "compact" : "default",
  };
}

export function buildDashboardModel({ data, formatNumber, labels }) {
  const todayOutput = data?.today_output ?? null;
  const tomorrowOutput = data?.tomorrow_output ?? null;
  const todayShipping = data?.today_shipping ?? null;
  const yesterdayShipping = data?.yesterday_shipping ?? null;

  const sectionsById = {
    "today-output": createSection({
      id: "today-output",
      title: labels.todayOutput,
      date: todayOutput?.date,
      items: normalizeShops(todayOutput),
      kind: "shop",
      statLabel: labels.activeShops,
      statValue:
        todayOutput && Number(todayOutput?.shops_count || 0) > 0
          ? `${formatNumber(todayOutput?.active_shops_count)}/${formatNumber(todayOutput?.shops_count)}`
          : null,
      emptyMessageKey: "noOutputData",
    }),
    "yesterday-shipping": createSection({
      id: "yesterday-shipping",
      title: labels.yesterdayShipping,
      date: yesterdayShipping?.date,
      items: normalizeCouriers(yesterdayShipping),
      kind: "courier",
      statLabel: labels.courierCount,
      statValue:
        yesterdayShipping && Number(yesterdayShipping?.couriers_count || 0) > 0
          ? formatNumber(yesterdayShipping?.couriers_count)
          : null,
      emptyMessageKey: "noShippingData",
    }),
    "today-shipping": createSection({
      id: "today-shipping",
      title: labels.todayShipping,
      date: todayShipping?.date,
      items: normalizeCouriers(todayShipping),
      kind: "courier",
      statLabel: labels.courierCount,
      statValue:
        todayShipping && Number(todayShipping?.couriers_count || 0) > 0
          ? formatNumber(todayShipping?.couriers_count)
          : null,
      emptyMessageKey: "noTodayShippingYet",
      emptyHintKey: "waitingForUpdate",
    }),
    "tomorrow-output": createSection({
      id: "tomorrow-output",
      title: labels.tomorrowOutput,
      date: tomorrowOutput?.date,
      items: normalizeShops(tomorrowOutput),
      kind: "shop",
      statLabel: labels.activeShops,
      statValue:
        tomorrowOutput && Number(tomorrowOutput?.shops_count || 0) > 0
          ? `${formatNumber(tomorrowOutput?.active_shops_count)}/${formatNumber(tomorrowOutput?.shops_count)}`
          : null,
      emptyMessageKey: "noTomorrowScheduleYet",
      emptyHintKey: "willAppearNextRefresh",
    }),
  };

  const metricsById = {
    "today-output": createMetric("today-output", labels.todayOutput, todayOutput?.total_quantity, formatNumber),
    "yesterday-shipping": createMetric(
      "yesterday-shipping",
      labels.yesterdayShipping,
      yesterdayShipping?.total_quantity,
      formatNumber,
    ),
    "today-shipping": createMetric("today-shipping", labels.todayShipping, todayShipping?.total_quantity, formatNumber),
    "tomorrow-output": createMetric("tomorrow-output", labels.tomorrowOutput, tomorrowOutput?.total_quantity, formatNumber),
  };

  const metrics = SECTION_ORDER.map((id) => metricsById[id]);
  const [primaryMetric, ...secondaryMetrics] = metrics;

  return {
    updatedAt: data?.updated_at ?? "",
    metrics,
    hero: {
      primaryMetric,
      secondaryMetrics,
    },
    sections: SECTION_ORDER.map((id) => sectionsById[id]),
  };
}
