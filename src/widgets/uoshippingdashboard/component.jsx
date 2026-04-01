import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import { useCallback, useMemo, useState } from "react";

import useWidgetAPI from "utils/proxy/use-widget-api";

const DEFAULT_REFRESH_INTERVAL = 30000;

function normalizeCategoryName(categoryName) {
  return String(categoryName || "").trim();
}

function formatNumber(t, value) {
  return t("common.number", { value: Number(value) || 0 });
}

function sortByQuantityThenName(a, b, nameKey) {
  const quantityDiff = Number(b?.total_quantity || 0) - Number(a?.total_quantity || 0);
  if (quantityDiff !== 0) {
    return quantityDiff;
  }

  return String(a?.[nameKey] || "").localeCompare(String(b?.[nameKey] || ""), "ja");
}

function normalizeShops(section) {
  if (!Array.isArray(section?.shops)) {
    return [];
  }

  return [...section.shops]
    .filter((shop) => Number(shop?.total_quantity || 0) > 0)
    .sort((a, b) => sortByQuantityThenName(a, b, "shop_name"));
}

function normalizeCouriers(section) {
  if (!Array.isArray(section?.couriers)) {
    return [];
  }

  return [...section.couriers]
    .filter((courier) => Number(courier?.total_quantity || 0) > 0)
    .sort((a, b) => sortByQuantityThenName(a, b, "courier_name"));
}

function getCategoryTone(categoryName, active = false) {
  const category = normalizeCategoryName(categoryName);
  const tones = {
    楽天: active
      ? "border-rose-400/70 bg-rose-500/20 text-rose-100"
      : "border-rose-400/30 bg-rose-500/10 text-rose-200",
    Amazon: active
      ? "border-amber-400/70 bg-amber-500/20 text-amber-100"
      : "border-amber-400/30 bg-amber-500/10 text-amber-200",
    メルカリ: active
      ? "border-pink-400/70 bg-pink-500/20 text-pink-100"
      : "border-pink-400/30 bg-pink-500/10 text-pink-200",
    auShop: active
      ? "border-orange-400/70 bg-orange-500/20 text-orange-100"
      : "border-orange-400/30 bg-orange-500/10 text-orange-200",
    Q10: active
      ? "border-violet-400/70 bg-violet-500/20 text-violet-100"
      : "border-violet-400/30 bg-violet-500/10 text-violet-200",
    TikTok: active
      ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
      : "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200",
    TEMU: active
      ? "border-sky-400/70 bg-sky-500/20 text-sky-100"
      : "border-sky-400/30 bg-sky-500/10 text-sky-200",
    その他: active
      ? "border-slate-300/70 bg-slate-500/20 text-slate-100"
      : "border-slate-300/30 bg-slate-500/10 text-slate-200",
  };

  return tones[category] ?? (active
    ? "border-theme-300/70 bg-theme-400/20 text-theme-50"
    : "border-theme-300/30 bg-theme-300/10 text-theme-200");
}

function getSectionCategories(items) {
  return [...new Set(items.map((item) => normalizeCategoryName(item.category_name)).filter(Boolean))];
}

function filterItemsByCategory(items, category) {
  return items.filter((item) => normalizeCategoryName(item.category_name) === category);
}

function getCategoryTotals(items, categories) {
  return categories.map((category) => ({
    name: category,
    total: items
      .filter((item) => normalizeCategoryName(item.category_name) === category)
      .reduce((sum, item) => sum + Number(item?.total_quantity || 0), 0),
  }));
}

function resolveActiveCategory(selectedCategory, categoryTotals) {
  const categories = categoryTotals.map((category) => category.name);

  if (selectedCategory && categories.includes(selectedCategory)) {
    return selectedCategory;
  }

  if (categories.includes("楽天")) {
    return "楽天";
  }

  return categories[0] ?? null;
}

function SummaryCard({ accentClass, label, value }) {
  return (
    <div
      className={`flex min-h-[82px] flex-col items-center justify-center rounded-xl border bg-theme-200/20 px-3 py-2.5 text-center shadow-sm dark:bg-theme-900/20 ${accentClass}`}
    >
      <div className="text-xl font-semibold leading-none tabular-nums text-theme-900 dark:text-theme-50">
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium text-theme-600 dark:text-theme-300">{label}</div>
    </div>
  );
}

function Panel({ bodyClassName = "", children, date, statLabel, statValue, title }) {
  return (
    <section className="min-w-0 self-start overflow-hidden rounded-xl border border-theme-200/40 bg-theme-100/10 dark:border-theme-700/40 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-theme-200/40 px-2.5 py-2 dark:border-theme-700/40">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-theme-900 dark:text-theme-50">{title}</div>
          {date && <div className="mt-0.5 text-[10px] tabular-nums text-theme-500 dark:text-theme-400">{date}</div>}
        </div>
        {statLabel && statValue && (
          <div className="rounded-full bg-theme-200/50 px-2 py-1 text-[10px] font-medium text-theme-600 dark:bg-theme-800/60 dark:text-theme-300">
            {statLabel}: {statValue}
          </div>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function EmptyState({ compact = false, message }) {
  return (
    <div className={`${compact ? "px-1 py-1.5" : "px-2.5 py-3"} text-center text-xs text-theme-500 dark:text-theme-400`}>
      <div
        className={`rounded-lg border border-dashed border-theme-300/50 dark:border-theme-700/50 ${compact ? "px-3 py-4" : "px-3 py-5"}`}
      >
        {message}
      </div>
    </div>
  );
}

function CategoryTabs({ activeCategory, categories, onChange, t }) {
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {categories.map((category) => {
        const isActive = activeCategory === category.name;

        return (
          <button
            key={category.name}
            type="button"
            onClick={() => onChange(category.name)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${getCategoryTone(category.name, isActive)}`}
          >
            <span>{category.name}</span>
            <span className="ml-1 tabular-nums opacity-90">{t("common.number", { value: category.total })}</span>
          </button>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 p-1.5">
      <div className="flex items-center justify-between px-1">
        <div className="h-3.5 w-16 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
        <div className="h-3.5 w-32 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={`summary-skeleton-${index}`}
            className="rounded-xl border border-theme-200/40 bg-theme-200/20 p-3 dark:border-theme-700/40 dark:bg-theme-900/20"
          >
            <div className="mb-2 h-5 w-12 animate-pulse rounded bg-theme-300/50 dark:bg-theme-700/50" />
            <div className="h-3 w-20 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, panelIndex) => (
          <div
            key={`panel-skeleton-${panelIndex}`}
            className="overflow-hidden rounded-xl border border-theme-200/40 bg-theme-100/10 dark:border-theme-700/40 dark:bg-white/5"
          >
            <div className="flex items-center justify-between border-b border-theme-200/40 px-3 py-2.5 dark:border-theme-700/40">
              <div>
                <div className="mb-1 h-3.5 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
                <div className="h-3 w-16 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-theme-300/30 dark:bg-theme-700/30" />
            </div>
            <div className="space-y-2 p-3">
              {[...Array(3)].map((__, itemIndex) => (
                <div
                  key={`item-skeleton-${panelIndex}-${itemIndex}`}
                  className="rounded-lg border border-theme-200/30 bg-theme-200/20 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
                >
                  <div className="mb-1 h-3.5 w-2/3 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;
  const [todayCategory, setTodayCategory] = useState(null);
  const [tomorrowCategory, setTomorrowCategory] = useState(null);
  const refreshInterval = Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL;

  const { data, error, mutate } = useWidgetAPI(widget, null, {
    refreshInterval: Math.max(1000, refreshInterval),
  });

  const handleRefresh = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      mutate();
    },
    [mutate],
  );

  const dashboard = useMemo(() => {
    const todayOutput = data?.today_output ?? null;
    const tomorrowOutput = data?.tomorrow_output ?? null;
    const todayShipping = data?.today_shipping ?? null;
    const yesterdayShipping = data?.yesterday_shipping ?? null;

    const outputSections = [
      {
        date: todayOutput?.date,
        emptyText: t("uoshippingdashboard.noOutputData"),
        items: normalizeShops(todayOutput),
        id: "today-output",
        kind: "shop",
        statLabel: t("uoshippingdashboard.activeShops"),
        statValue:
          todayOutput && Number(todayOutput?.shops_count || 0) > 0
            ? `${formatNumber(t, todayOutput?.active_shops_count)}/${formatNumber(t, todayOutput?.shops_count)}`
            : null,
        title: t("uoshippingdashboard.todayOutput"),
      },
      {
        date: tomorrowOutput?.date,
        emptyText: t("uoshippingdashboard.noOutputData"),
        items: normalizeShops(tomorrowOutput),
        id: "tomorrow-output",
        kind: "shop",
        statLabel: t("uoshippingdashboard.activeShops"),
        statValue:
          tomorrowOutput && Number(tomorrowOutput?.shops_count || 0) > 0
            ? `${formatNumber(t, tomorrowOutput?.active_shops_count)}/${formatNumber(t, tomorrowOutput?.shops_count)}`
            : null,
        title: t("uoshippingdashboard.tomorrowOutput"),
      },
    ];

    const shippingSections = [
      {
        date: todayShipping?.date,
        emptyText: t("uoshippingdashboard.noShippingData"),
        items: normalizeCouriers(todayShipping),
        kind: "courier",
        statLabel: t("uoshippingdashboard.courierCount"),
        statValue:
          todayShipping && Number(todayShipping?.couriers_count || 0) > 0
            ? formatNumber(t, todayShipping?.couriers_count)
            : null,
        title: t("uoshippingdashboard.todayShipping"),
      },
      {
        date: yesterdayShipping?.date,
        emptyText: t("uoshippingdashboard.noShippingData"),
        items: normalizeCouriers(yesterdayShipping),
        kind: "courier",
        statLabel: t("uoshippingdashboard.courierCount"),
        statValue:
          yesterdayShipping && Number(yesterdayShipping?.couriers_count || 0) > 0
            ? formatNumber(t, yesterdayShipping?.couriers_count)
            : null,
        title: t("uoshippingdashboard.yesterdayShipping"),
      },
    ];

    return {
      sections: [...outputSections, ...shippingSections],
      summary: [
        {
          accentClass: "border-emerald-500/30",
          label: t("uoshippingdashboard.todayOutput"),
          value: formatNumber(t, todayOutput?.total_quantity),
        },
        {
          accentClass: "border-amber-500/30",
          label: t("uoshippingdashboard.tomorrowOutput"),
          value: formatNumber(t, tomorrowOutput?.total_quantity),
        },
        {
          accentClass: "border-sky-500/30",
          label: t("uoshippingdashboard.todayShipping"),
          value: formatNumber(t, todayShipping?.total_quantity),
        },
        {
          accentClass: "border-violet-500/30",
          label: t("uoshippingdashboard.yesterdayShipping"),
          value: formatNumber(t, yesterdayShipping?.total_quantity),
        },
      ],
      updatedAt: data?.updated_at ?? "",
    };
  }, [data, t]);

  if (error) {
    return <Container service={service} error={error} />;
  }

  if (!data) {
    return (
      <Container service={service}>
        <LoadingSkeleton />
      </Container>
    );
  }

  return (
    <Container service={service}>
      <div className="flex w-full min-w-0 flex-col gap-3 p-1.5">
        <div className="flex items-center justify-end gap-2 px-1">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-theme-700 dark:text-theme-200">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-theme-500 dark:text-theme-400">
              {t("uoshippingdashboard.updatedAt")}
            </span>
            <span className="truncate tabular-nums">{dashboard.updatedAt || "-"}</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-theme-200/40 p-1.5 text-theme-500 transition-colors hover:bg-theme-200/50 hover:text-theme-700 dark:border-theme-700/40 dark:text-theme-400 dark:hover:bg-theme-700/50 dark:hover:text-theme-200"
            title={t("uoshippingdashboard.refresh")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {dashboard.summary.map((item) => (
            <SummaryCard key={item.label} accentClass={item.accentClass} label={item.label} value={item.value} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {dashboard.sections.map((section) => (
            <Panel
              key={section.title}
              date={section.date}
              statLabel={section.statLabel}
              statValue={section.statValue}
              title={section.title}
            >
              {section.kind === "shop" ? (
                (() => {
                  const categoryTotals = getCategoryTotals(section.items, getSectionCategories(section.items));
                  const rawActiveCategory = section.id === "today-output" ? todayCategory : tomorrowCategory;
                  const activeCategory = resolveActiveCategory(rawActiveCategory, categoryTotals);
                  const visibleItems = filterItemsByCategory(section.items, activeCategory);

                  return (
                    <div className="p-2.5">
                      {categoryTotals.length > 1 && (
                        <CategoryTabs
                          activeCategory={activeCategory}
                          categories={categoryTotals}
                          onChange={section.id === "today-output" ? setTodayCategory : setTomorrowCategory}
                          t={t}
                        />
                      )}

                      {visibleItems.length === 0 ? (
                        <EmptyState compact message={section.emptyText} />
                      ) : (
                        <div className="max-h-[232px] space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
                          {visibleItems.map((item) => (
                            <div
                              key={`${section.title}-${section.kind}-${item.shop_id}`}
                              className="flex items-center justify-between gap-2 rounded-lg border border-theme-200/30 bg-theme-200/20 px-2.5 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-theme-900 dark:text-theme-100">
                                  {item.shop_name}
                                </div>
                              </div>
                              <div className="shrink-0 text-sm font-semibold tabular-nums text-theme-800 dark:text-theme-100">
                                {formatNumber(t, item.total_quantity)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : section.items.length === 0 ? (
                <div className="p-2">
                  <EmptyState compact message={section.emptyText} />
                </div>
              ) : (
                <div className="max-h-[232px] space-y-2 overflow-y-auto p-2.5 pr-3 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
                  {section.items.map((item) => (
                    <div
                      key={`${section.title}-${section.kind}-${item.courier_id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-theme-200/30 bg-theme-200/20 px-2.5 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
                    >
                      <div className="min-w-0 truncate text-sm font-medium text-theme-900 dark:text-theme-100">
                        {item.courier_name}
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-theme-800 dark:text-theme-100">
                        {formatNumber(t, item.total_quantity)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>
      </div>
    </Container>
  );
}
