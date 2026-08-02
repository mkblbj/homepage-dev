const STATUS_DOT = {
  normal: "bg-emerald-500",
  attention: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-theme-400",
};

const CONTROL_CLASS =
  "rounded-lg border border-theme-300/60 px-2.5 py-1 text-xs font-bold text-theme-700 transition-colors hover:bg-theme-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-theme-600/60 dark:text-theme-200 dark:hover:bg-theme-700/50";

export default function SummaryHeader({
  generatedAtJST,
  language,
  onRefresh,
  onSwitchLanguage,
  refreshDisabled,
  refreshPending,
  runState,
  severity,
  t,
}) {
  return (
    <header className="flex flex-wrap items-center gap-2">
      <span
        role="img"
        aria-label={t(`uoaisummary.severity.${severity || "unknown"}`)}
        data-testid="uoaisummary-status-dot"
        data-severity={severity || "unknown"}
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[severity] || STATUS_DOT.unknown}`}
      />
      <span className="truncate text-sm font-bold text-theme-900 dark:text-theme-50">{t("uoaisummary.title")}</span>
      <span className="text-xs text-theme-500 dark:text-theme-400">{generatedAtJST || "—"}</span>
      {runState ? (
        <span role="status" className="text-xs text-theme-500 dark:text-theme-400">
          · {t(`uoaisummary.${runState}`)}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onSwitchLanguage} className={CONTROL_CLASS}>
          {t(language === "ja" ? "uoaisummary.switchToChinese" : "uoaisummary.switchToJapanese")}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshDisabled}
          aria-busy={refreshPending}
          className={CONTROL_CLASS}
        >
          {t("uoaisummary.reanalyze")}
        </button>
      </span>
    </header>
  );
}
