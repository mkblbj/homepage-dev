import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next/pages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatProxyUrl } from "utils/proxy/api-helpers";
import useWidgetAPI from "utils/proxy/use-widget-api";

import ActionList from "./action-list";
import MetricStrip from "./metric-strip";
import SummaryHeader from "./summary-header";

const DEFAULT_REFRESH_INTERVAL = 60000;
const RUNNING_REFRESH_INTERVAL = 3000;

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
  const runState =
    data.state === "running"
      ? "analyzing"
      : data.state === "stale" || data.state === "error"
        ? "stale"
        : data.state === "partial" || data.dataQuality === "partial"
          ? "partial"
          : null;
  const metricsByKey = Object.fromEntries((data.metrics || []).map((entry) => [entry.key, entry]));

  return (
    <Container service={service}>
      <div className="@container flex w-full min-w-0 flex-col gap-3 p-1.5">
        <SummaryHeader
          generatedAtJST={data.generatedAtJST}
          language={language}
          onRefresh={onRefresh}
          onSwitchLanguage={onSwitchLanguage}
          refreshDisabled={data.state === "running" || refreshPending || cooldownActive}
          refreshPending={data.state === "running" || refreshPending}
          runState={runState}
          severity={data.severity}
          t={t}
        />

        <RefreshFeedback cooldownUntilJST={cooldownUntilJST} refreshError={refreshError} t={t} />
        <ErrorFeedback lastError={data.lastError} role="alert" t={t} />

        <div>
          <p className="text-lg font-bold leading-relaxed text-theme-900 dark:text-theme-50">
            {data.summary.headline[language]}
          </p>
          <p className="mt-2 text-sm leading-6 text-theme-700 dark:text-theme-200">
            {data.summary.assessment[language]}
          </p>
          <ActionList actions={data.summary.actions} language={language} metricsByKey={metricsByKey} t={t} />
        </div>

        <MetricStrip
          metricsByKey={metricsByKey}
          onToggle={onToggleDetails}
          open={detailsOpen}
          sourceCoverage={data.sourceCoverage}
          sourceFreshness={data.sourceFreshness}
          t={t}
        />
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
    : "border-theme-300/50 bg-theme-200/30 text-theme-800 dark:border-theme-600/50 dark:bg-white/[0.04] dark:text-theme-100";

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
            className="mt-3 rounded-lg border border-theme-300/60 px-2.5 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50"
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
