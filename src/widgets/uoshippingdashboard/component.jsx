import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import { useCallback, useMemo, useState } from "react";

import { buildDashboardModel, normalizeCategoryName } from "./dashboard-model.mjs";

import useWidgetAPI from "utils/proxy/use-widget-api";


const DEFAULT_REFRESH_INTERVAL = 30000;

function formatNumber(t, value) {
  return t("common.number", { value: Number(value) || 0 });
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

function HeroMetric({ label, primary = false, value }) {
  return (
    <div
      className={primary
        ? "rounded-2xl border border-theme-200/35 bg-black/20 px-4 py-3 text-left shadow-sm dark:border-theme-700/40 dark:bg-black/20"
        : "rounded-2xl border border-theme-200/20 bg-white/5 px-3 py-3 text-left dark:border-theme-700/30 dark:bg-white/5"
      }
    >
      <div
        className={primary
          ? "text-[2rem] font-semibold leading-none tabular-nums text-theme-50"
          : "text-xl font-semibold leading-none tabular-nums text-theme-50"
        }
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium text-theme-200/90">{label}</div>
    </div>
  );
}

function HeroHeader({ hero, onRefresh, t, updatedAt }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-theme-200/35 bg-gradient-to-br from-theme-200/20 via-theme-100/10 to-theme-300/10 p-3 shadow-sm dark:border-theme-700/40 dark:from-theme-900/35 dark:via-theme-900/10 dark:to-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-600 dark:text-theme-300">
            {t("uoshippingdashboard.updatedAt")}
          </div>
          <div className="mt-1 truncate text-sm font-medium tabular-nums text-theme-900 dark:text-theme-50">
            {updatedAt || "-"}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-xl border border-theme-200/30 p-2 text-theme-600 transition-colors hover:bg-theme-200/40 hover:text-theme-800 dark:border-theme-700/40 dark:text-theme-300 dark:hover:bg-theme-700/40 dark:hover:text-theme-50"
          title={t("uoshippingdashboard.refresh")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1.35fr,1fr,1fr,1fr]">
        <HeroMetric label={hero.primaryMetric.label} value={hero.primaryMetric.value} primary />
        {hero.secondaryMetrics.map((metric) => (
          <HeroMetric key={metric.id} label={metric.label} value={metric.value} />
        ))}
      </div>
    </section>
  );
}

function Panel({ bodyClassName = "", children, date, statLabel, statValue, title }) {
  return (
    <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-theme-200/25 bg-theme-100/5 dark:border-theme-700/30 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-theme-200/20 px-3 py-2.5 dark:border-theme-700/30">
        <div className="min-w-0">
          <div className="text-base font-semibold text-theme-900 dark:text-theme-50">{title}</div>
          {date ? <div className="mt-1 text-[11px] tabular-nums text-theme-500 dark:text-theme-400">{date}</div> : null}
        </div>
        {statLabel && statValue ? (
          <div className="rounded-full bg-theme-200/40 px-2.5 py-1 text-[10px] font-medium text-theme-700 dark:bg-theme-800/50 dark:text-theme-200">
            {statLabel}: {statValue}
          </div>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function EmptyState({ compact = false, message }) {
  return (
    <div className={`${compact ? "px-2 py-2.5" : "px-2.5 py-3"} text-center text-xs text-theme-500 dark:text-theme-400`}>
      <div className={`rounded-xl border border-dashed border-theme-300/30 dark:border-theme-700/40 ${compact ? "px-3 py-4" : "px-3 py-5"}`}>
        {message}
      </div>
    </div>
  );
}

function CompactEmptyState({ hint, message }) {
  return (
    <div className="px-2.5 py-2.5">
      <div className="rounded-xl border border-dashed border-theme-300/35 bg-theme-200/10 px-3 py-3 text-left dark:border-theme-700/40 dark:bg-theme-900/10">
        <div className="text-xs font-medium text-theme-800 dark:text-theme-100">{message}</div>
        {hint ? <div className="mt-1 text-[10px] text-theme-500 dark:text-theme-400">{hint}</div> : null}
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
      <div className="overflow-hidden rounded-2xl border border-theme-200/35 bg-theme-200/15 p-3 dark:border-theme-700/40 dark:bg-theme-900/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="h-3 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-xl bg-theme-300/30 dark:bg-theme-700/30" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1.35fr,1fr,1fr,1fr]">
          <div className="rounded-2xl border border-theme-200/30 bg-theme-200/20 p-4 dark:border-theme-700/30 dark:bg-theme-900/20">
            <div className="h-8 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
          </div>
          {[...Array(3)].map((_, index) => (
            <div key={index} className="rounded-2xl border border-theme-200/20 bg-theme-200/15 p-4 dark:border-theme-700/30 dark:bg-theme-900/15">
              <div className="h-6 w-12 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
              <div className="mt-2 h-3 w-14 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, panelIndex) => (
          <div key={panelIndex} className="overflow-hidden rounded-2xl border border-theme-200/25 bg-theme-100/5 dark:border-theme-700/30 dark:bg-white/5">
            <div className="flex items-center justify-between border-b border-theme-200/20 px-3 py-2.5 dark:border-theme-700/30">
              <div>
                <div className="h-4 w-20 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
                <div className="mt-2 h-3 w-16 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-theme-300/30 dark:bg-theme-700/30" />
            </div>
            <div className="space-y-2 p-3">
              {[...Array(3)].map((__, itemIndex) => (
                <div key={itemIndex} className="rounded-xl border border-theme-200/20 bg-theme-200/15 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-theme-300/40 dark:bg-theme-700/40" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-theme-300/30 dark:bg-theme-700/30" />
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

  const dashboard = useMemo(
    () =>
      buildDashboardModel({
        data,
        formatNumber: (value) => formatNumber(t, value),
        labels: {
          activeShops: t("uoshippingdashboard.activeShops"),
          courierCount: t("uoshippingdashboard.courierCount"),
          todayOutput: t("uoshippingdashboard.todayOutput"),
          yesterdayShipping: t("uoshippingdashboard.yesterdayShipping"),
          todayShipping: t("uoshippingdashboard.todayShipping"),
          tomorrowOutput: t("uoshippingdashboard.tomorrowOutput"),
        },
      }),
    [data, t],
  );

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
        <HeroHeader hero={dashboard.hero} onRefresh={handleRefresh} t={t} updatedAt={dashboard.updatedAt} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {dashboard.sections.map((section) => (
            <Panel
              key={section.id}
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
                  const isCompactEmpty = section.emptyVariant === "compact" && visibleItems.length === 0;

                  return (
                    <div className="p-2.5">
                      {visibleItems.length > 0 && categoryTotals.length > 1 ? (
                        <CategoryTabs
                          activeCategory={activeCategory}
                          categories={categoryTotals}
                          onChange={section.id === "today-output" ? setTodayCategory : setTomorrowCategory}
                          t={t}
                        />
                      ) : null}

                      {visibleItems.length === 0 ? (
                        isCompactEmpty ? (
                          <CompactEmptyState
                            message={t(`uoshippingdashboard.${section.emptyMessageKey}`)}
                            hint={section.emptyHintKey ? t(`uoshippingdashboard.${section.emptyHintKey}`) : null}
                          />
                        ) : (
                          <EmptyState compact message={t(`uoshippingdashboard.${section.emptyMessageKey}`)} />
                        )
                      ) : (
                        <div className="max-h-[232px] space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
                          {visibleItems.map((item) => (
                            <div
                              key={`${section.id}-${item.shop_id}`}
                              className="flex items-center justify-between gap-2 rounded-xl border border-theme-200/20 bg-theme-200/15 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
                            >
                              <div className="min-w-0 truncate text-sm font-medium text-theme-900 dark:text-theme-100">
                                {item.shop_name}
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
                section.emptyVariant === "compact" ? (
                  <CompactEmptyState
                    message={t(`uoshippingdashboard.${section.emptyMessageKey}`)}
                    hint={section.emptyHintKey ? t(`uoshippingdashboard.${section.emptyHintKey}`) : null}
                  />
                ) : (
                  <div className="p-2">
                    <EmptyState compact message={t(`uoshippingdashboard.${section.emptyMessageKey}`)} />
                  </div>
                )
              ) : (
                <div className="max-h-[232px] space-y-2 overflow-y-auto p-2.5 pr-3 scrollbar-thin scrollbar-thumb-theme-300/50 scrollbar-track-transparent dark:scrollbar-thumb-theme-600/50">
                  {section.items.map((item) => (
                    <div
                      key={`${section.id}-${item.courier_id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-theme-200/20 bg-theme-200/15 px-3 py-2 dark:border-theme-700/30 dark:bg-theme-900/10"
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
