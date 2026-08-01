import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatProxyUrl } from "utils/proxy/api-helpers";
import useWidgetAPI from "utils/proxy/use-widget-api";

const DEFAULT_REFRESH_INTERVAL = 60000;
const RUNNING_REFRESH_INTERVAL = 3000;

const TONES = {
  normal: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  attention: "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  unknown: "border-theme-400/40 bg-theme-500/10 text-theme-700 dark:text-theme-200",
};

const CONTROL_CLASS =
  "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-theme-50 dark:focus-visible:ring-violet-300 dark:focus-visible:ring-offset-theme-900";

const ERROR_MESSAGE_KEYS = {
  configuration: "errorConfiguration",
  source_timeout: "errorSources",
  source_unavailable: "errorSources",
  model_timeout: "errorModel",
  model_http: "errorModel",
  model_schema: "errorModel",
  cache: "errorCache",
  unexpected: "errorUnexpected",
};

function parseJSTTimestamp(value) {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?) JST$/.exec(value || "");
  return match ? Date.parse(`${match[1]}T${match[2]}+09:00`) : Number.NaN;
}

function ErrorFeedback({ lastError, role, t }) {
  const errorKey = ERROR_MESSAGE_KEYS[lastError];

  return errorKey ? (
    <p role={role} className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
      {t(`uoaisummary.${errorKey}`)}
    </p>
  ) : null;
}

function RefreshFeedback({ cooldownUntilJST, refreshError, t }) {
  const refreshKey = refreshError === "cooldown" ? "cooldown" : refreshError === "unexpected" ? "refreshFailed" : null;

  if (cooldownUntilJST) {
    return (
      <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        {t("uoaisummary.cooldownUntil", { deadline: cooldownUntilJST })}
      </p>
    );
  }

  return refreshKey ? (
    <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      {t(`uoaisummary.${refreshKey}`)}
    </p>
  ) : null;
}

function Cockpit({
  cooldownActive,
  cooldownUntilJST,
  data,
  detailsOpen,
  language,
  onRefresh,
  onSwitchLanguage,
  onToggleDetails,
  refreshError,
  refreshPending,
  service,
  t,
}) {
  const stateKey =
    data.state === "running"
      ? "analyzing"
      : data.state === "stale" || data.state === "error"
        ? "stale"
        : data.state === "partial" || data.dataQuality === "partial"
          ? "partial"
          : null;
  return (
    <Container service={service}>
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        <header className="flex flex-wrap items-center justify-between gap-3 px-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="text-xl text-violet-500">
              ✦
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-theme-900 dark:text-theme-50">
                {t("uoaisummary.title")}
              </span>
              <span className="text-[10px] text-theme-600 dark:text-theme-300">
                {t("uoaisummary.updatedAt")} · {data.generatedAtJST || "—"}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                TONES[data.severity] || TONES.unknown
              }`}
            >
              {t(`uoaisummary.severity.${data.severity || "unknown"}`)}
            </span>
            {stateKey ? (
              <span
                role="status"
                className="rounded-full border border-theme-400/40 px-2.5 py-1 text-[11px] font-bold text-theme-700 dark:text-theme-200"
              >
                {t(`uoaisummary.${stateKey}`)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSwitchLanguage}
              className={`${CONTROL_CLASS} border-theme-300/60 text-theme-800 hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-100 dark:hover:bg-theme-700/50`}
            >
              {t(language === "ja" ? "uoaisummary.switchToChinese" : "uoaisummary.switchToJapanese")}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={data.state === "running" || refreshPending || cooldownActive}
              aria-busy={data.state === "running" || refreshPending}
              className={`${CONTROL_CLASS} border-violet-400/50 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300`}
            >
              {t("uoaisummary.reanalyze")}
            </button>
          </div>
        </header>

        <RefreshFeedback cooldownUntilJST={cooldownUntilJST} refreshError={refreshError} t={t} />
        <ErrorFeedback lastError={data.lastError} role="alert" t={t} />

        <section className="rounded-2xl border border-theme-300/40 bg-theme-200/30 p-5 dark:border-theme-600/40 dark:bg-white/10">
          <p className="text-lg font-bold leading-relaxed text-theme-900 dark:text-theme-50">
            {data.summary.headline[language]}
          </p>
          <p className="mt-2 text-sm leading-6 text-theme-700 dark:text-theme-200">
            {data.summary.assessment[language]}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-2 @3xl:grid-cols-2 @6xl:grid-cols-4">
          {data.summary.evidence.map((evidence) => {
            const display = data.metricDisplay[evidence.metricKey];

            return (
              <article
                key={evidence.metricKey}
                className="rounded-xl border border-theme-300/30 bg-theme-100/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-theme-500 dark:text-theme-400">
                  {evidence.metricKey}
                </span>
                <strong className="mt-1 block text-xl tabular-nums text-theme-900 dark:text-theme-50">
                  {display?.[language] || "—"}
                </strong>
                <p className="mt-2 text-xs leading-5 text-theme-700 dark:text-theme-200">
                  {evidence.interpretation[language]}
                </p>
              </article>
            );
          })}
        </section>

        <button
          type="button"
          aria-controls="uoaisummary-details"
          aria-expanded={detailsOpen}
          onClick={onToggleDetails}
          className={`${CONTROL_CLASS} border-theme-300/60 py-2 text-theme-800 hover:bg-theme-200/50 dark:border-theme-600/60 dark:text-theme-100 dark:hover:bg-theme-700/50`}
        >
          {detailsOpen ? t("uoaisummary.hideDetails") : t("uoaisummary.showDetails")}
        </button>

        <div id="uoaisummary-details" className="flex flex-col gap-3">
          <section className="grid grid-cols-1 gap-2 @4xl:grid-cols-3">
            {data.summary.actions.slice(0, 3).map((action, index) => (
              <article
                key={`${action.module}-${index}`}
                className="rounded-xl border border-theme-300/30 p-3 dark:border-white/[0.06]"
              >
                <span className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">
                  {t(`uoaisummary.priority.${action.priority}`)}
                </span>
                <h3 className="mt-1 font-bold text-theme-900 dark:text-theme-50">{action.title[language]}</h3>
                {detailsOpen ? (
                  <p className="mt-1 text-xs leading-5 text-theme-700 dark:text-theme-200">{action.reason[language]}</p>
                ) : null}
                {action.shopName ? <span className="mt-2 block text-xs text-theme-500">{action.shopName}</span> : null}
              </article>
            ))}
          </section>
          {detailsOpen ? (
            <>
              <section className="rounded-xl border border-theme-300/30 p-3 dark:border-white/[0.06]">
                <h3 className="text-xs font-bold text-theme-700 dark:text-theme-200">
                  {t("uoaisummary.coverage")} · {data.sourceCoverage.valid}/{data.sourceCoverage.total}
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-2 @4xl:grid-cols-4">
                  {Object.entries(data.sourceFreshness).map(([source, freshness]) => (
                    <div key={source} className="rounded-lg bg-theme-200/30 p-2 dark:bg-white/[0.04]">
                      <dt className="text-[10px] font-bold text-theme-800 dark:text-theme-100">
                        {t(`uoaisummary.source.${source}`)}
                      </dt>
                      <dd className="mt-1 text-xs text-theme-700 dark:text-theme-200">
                        {t(`uoaisummary.sourceState.${freshness.state}`)}
                        {freshness.updatedAtJST ? ` · ${freshness.updatedAtJST}` : ""}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              {data.summary.reviewThemes.length ? (
                <section>
                  <h3 className="text-xs font-bold text-theme-700 dark:text-theme-200">
                    {t("uoaisummary.reviewThemes")}
                  </h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 @4xl:grid-cols-3">
                    {data.summary.reviewThemes.map((theme, index) => (
                      <article key={index} className="rounded-xl bg-theme-200/30 p-3 dark:bg-white/[0.04]">
                        <h4 className="font-bold text-theme-900 dark:text-theme-50">{theme.theme[language]}</h4>
                        <p className="mt-1 text-xs text-theme-700 dark:text-theme-200">{theme.impact[language]}</p>
                        <p className="mt-1 text-xs text-theme-700 dark:text-theme-200">{theme.suggestion[language]}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Container>
  );
}

function NoSummary({ cooldownActive, cooldownUntilJST, data, onRefresh, refreshError, refreshPending, service, t }) {
  const isRunning = data.state === "running";
  const isError = data.state === "error";
  const titleKey = isRunning ? "analyzing" : isError ? "cannotGenerate" : "noSummary";
  const descriptionKey = isRunning ? "analyzingFirst" : isError ? "insufficient" : "waiting";
  const tone = isError
    ? "border-amber-400/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    : "border-violet-400/40 bg-violet-500/10 text-theme-800 dark:text-theme-100";

  return (
    <Container service={service}>
      <div className="flex w-full flex-col gap-3">
        <div role={isError ? "alert" : "status"} className={`w-full rounded-2xl border p-5 ${tone}`}>
          <h2 className="font-bold">{t(`uoaisummary.${titleKey}`)}</h2>
          <p className="mt-1 text-sm">{t(`uoaisummary.${descriptionKey}`)}</p>
          <ErrorFeedback lastError={data.lastError} t={t} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRunning || refreshPending || cooldownActive}
            aria-busy={isRunning || refreshPending}
            className={`${CONTROL_CLASS} mt-3 border-theme-400/50 hover:bg-theme-200/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-theme-500/50 dark:hover:bg-theme-700/40`}
          >
            {t("uoaisummary.reanalyze")}
          </button>
        </div>
        <RefreshFeedback cooldownUntilJST={cooldownUntilJST} refreshError={refreshError} t={t} />
      </div>
    </Container>
  );
}

export default function Component({ service }) {
  const { i18n } = useTranslation();
  const { widget } = service;
  const [language, setLanguage] = useState("ja");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [refreshCooldownUntilJST, setRefreshCooldownUntilJST] = useState(null);
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [refreshPending, setRefreshPending] = useState(false);
  const refreshLockRef = useRef(false);
  const refreshInterval = Math.max(1000, Number(widget.refreshInterval) || DEFAULT_REFRESH_INTERVAL);
  const { data, error, mutate } = useWidgetAPI(widget, "summary", { refreshInterval });
  const t = useMemo(() => i18n.getFixedT(language === "ja" ? "ja" : "zh-Hans", "common"), [i18n, language]);
  const cooldownUntilJST = refreshCooldownUntilJST || data?.cooldownUntilJST || null;
  const cooldownDeadlineTs = parseJSTTimestamp(cooldownUntilJST);
  const cooldownActive = Boolean(
    cooldownUntilJST && (!Number.isFinite(cooldownDeadlineTs) || cooldownDeadlineTs > cooldownNow),
  );
  const activeCooldownUntilJST = cooldownActive ? cooldownUntilJST : null;

  const refresh = useCallback(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (refreshLockRef.current) return null;

      refreshLockRef.current = true;
      setRefreshPending(true);
      setRefreshError(null);

      try {
        const response = await fetch(formatProxyUrl(widget, "refresh"), {
          method: "POST",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json();

        if (!response.ok && response.status !== 429) throw new Error("refresh_failed");
        if (response.status === 429) {
          setRefreshError("cooldown");
          setRefreshCooldownUntilJST(typeof payload.cooldownUntilJST === "string" ? payload.cooldownUntilJST : null);
        } else {
          setRefreshCooldownUntilJST(null);
        }
        await mutate();
        return payload;
      } catch {
        setRefreshError("unexpected");
        return null;
      } finally {
        refreshLockRef.current = false;
        setRefreshPending(false);
      }
    },
    [mutate, widget],
  );

  const switchLanguage = useCallback(() => {
    setLanguage((current) => (current === "ja" ? "zh" : "ja"));
  }, []);

  useEffect(() => {
    if (data?.state !== "running") return undefined;
    const poll = setInterval(() => mutate(), RUNNING_REFRESH_INTERVAL);
    return () => clearInterval(poll);
  }, [data?.state, mutate]);

  useEffect(() => {
    if (!Number.isFinite(cooldownDeadlineTs) || cooldownDeadlineTs <= Date.now()) return undefined;

    let timeout;
    const scheduleExpiry = () => {
      const remaining = cooldownDeadlineTs - Date.now();
      if (remaining <= 0) {
        setCooldownNow(Date.now());
        return;
      }
      timeout = setTimeout(scheduleExpiry, Math.min(remaining, 2_147_483_647));
    };
    scheduleExpiry();
    return () => clearTimeout(timeout);
  }, [cooldownDeadlineTs]);

  if (error) return <Container service={service} error={error} />;
  if (!data) {
    return (
      <Container service={service}>
        <div aria-busy="true" className="flex w-full animate-pulse flex-col gap-3 p-1.5">
          <div className="h-8 w-64 max-w-full rounded bg-theme-300/30 dark:bg-theme-700/30" />
          <div className="h-28 w-full rounded-2xl bg-theme-200/30 dark:bg-white/10" />
          <div className="grid grid-cols-1 gap-2 @3xl:grid-cols-2">
            <div className="h-24 rounded-xl bg-theme-200/30 dark:bg-white/10" />
            <div className="h-24 rounded-xl bg-theme-200/30 dark:bg-white/10" />
          </div>
        </div>
      </Container>
    );
  }
  if (!data.summary) {
    return (
      <NoSummary
        cooldownActive={cooldownActive}
        cooldownUntilJST={activeCooldownUntilJST}
        data={data}
        onRefresh={refresh}
        refreshError={refreshError}
        refreshPending={refreshPending}
        service={service}
        t={t}
      />
    );
  }

  return (
    <Cockpit
      cooldownActive={cooldownActive}
      cooldownUntilJST={activeCooldownUntilJST}
      data={data}
      detailsOpen={detailsOpen}
      language={language}
      onRefresh={refresh}
      onSwitchLanguage={switchLanguage}
      onToggleDetails={() => setDetailsOpen((value) => !value)}
      refreshError={refreshError}
      refreshPending={refreshPending}
      service={service}
      t={t}
    />
  );
}
