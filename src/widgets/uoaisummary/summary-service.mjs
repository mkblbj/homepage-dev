import { publicErrorCode } from "./errors.mjs";
import { appendSnapshot } from "./summary-store.mjs";

function parseTimestamp(value) {
  if (typeof value !== "string") return Number.NaN;
  const jst = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?) JST$/.exec(value);
  return Date.parse(jst ? `${jst[1]}T${jst[2]}+09:00` : value);
}

async function onceWithRetry(work) {
  try {
    return await work();
  } catch (error) {
    if (!error?.retryable) throw error;
    return work();
  }
}

export function createSummaryService(dependencies) {
  const { loadConfiguration, collectSources, buildAnalysisInput, requestSummaryOnce, store, clock, timers, logger } =
    dependencies;

  let persisted = store.read();
  let activePromise = null;
  let timer = null;
  let stopped = false;
  let runtimeState = persisted.latest
    ? persisted.lastError || persisted.latest.dataQuality === "stale"
      ? "stale"
      : persisted.latest.dataQuality === "partial"
        ? "partial"
        : "ready"
    : persisted.lastError
      ? "error"
      : "empty";
  let runtimeAnalysis = null;
  let currentConfiguration = null;
  let initializationPromise = null;

  function schedule(delayMs) {
    if (stopped) return;
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => requestRefresh({ manual: false }), Math.max(0, delayMs));
    if (typeof timer?.unref === "function") timer.unref();
  }

  function initialize() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      currentConfiguration = await loadConfiguration();
      if (stopped) return currentConfiguration;

      const dueTs = parseTimestamp(persisted.nextScheduledAtJST);
      if (!Number.isFinite(dueTs) || dueTs <= clock.now()) {
        requestRefresh({ manual: false });
      } else {
        schedule(dueTs - clock.now());
      }
      return currentConfiguration;
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });

    return initializationPromise;
  }

  async function runGeneration() {
    currentConfiguration = await loadConfiguration();
    const { ai, sources } = currentConfiguration;
    persisted.lastAttemptAtJST = clock.toJST(clock.now());
    const collected = await collectSources(sources, {
      nowTs: clock.now(),
      timeoutMs: Math.min(ai.requestTimeout, 15000),
    });
    const previousSnapshot = persisted.snapshots.at(-1) || null;
    const analysis = buildAnalysisInput(collected, {
      previousSnapshot,
      nowTs: clock.now(),
    });
    runtimeAnalysis = analysis;

    if (analysis.sourceCoverage.valid < 2) {
      const error = new Error("Insufficient business sources");
      error.code = "source_unavailable";
      error.retryable = false;
      throw error;
    }

    persisted = appendSnapshot(persisted, analysis.snapshot);
    const metricKeys = new Set(Object.keys(analysis.metrics));
    const shopNames = new Set(analysis.modelInput.shops?.map((shop) => shop.name) || []);
    const generated = await onceWithRetry(() =>
      requestSummaryOnce({
        config: ai,
        modelInput: analysis.modelInput,
        metricKeys,
        shopNames,
      }),
    );
    const generatedAtJST = clock.toJST(clock.now());
    persisted.latest = {
      severity: analysis.severity,
      dataQuality: analysis.dataQuality,
      generatedAtJST,
      sourceCoverage: analysis.sourceCoverage,
      sourceFreshness: analysis.sourceFreshness,
      summary: generated.summary,
      metricDisplay: Object.fromEntries(
        generated.summary.evidence.map(({ metricKey }) => [metricKey, analysis.metricDisplay[metricKey]]),
      ),
    };
    persisted.usage = generated.usage || null;
    persisted.lastError = null;
    persisted.nextScheduledAtJST = clock.toJST(clock.now() + ai.generationInterval);
    runtimeState = analysis.dataQuality === "partial" ? "partial" : "ready";
    schedule(ai.generationInterval);
  }

  function requestRefresh({ manual }) {
    if (activePromise) {
      return {
        accepted: false,
        state: "running",
        cooldownUntilJST: persisted.manualCooldownUntilJST,
      };
    }

    if (manual && parseTimestamp(persisted.manualCooldownUntilJST) > clock.now()) {
      return {
        accepted: false,
        state: "cooldown",
        cooldownUntilJST: persisted.manualCooldownUntilJST,
      };
    }

    if (manual) {
      persisted.manualCooldownUntilJST = clock.toJST(clock.now() + currentConfiguration.ai.manualCooldown);
      store.write(persisted);
    }

    runtimeState = "running";
    activePromise = runGeneration()
      .catch((error) => {
        persisted.lastError = publicErrorCode(error);
        runtimeState = persisted.latest ? "stale" : "error";
        const interval = currentConfiguration?.ai?.generationInterval || 3600000;
        persisted.nextScheduledAtJST = clock.toJST(clock.now() + interval);
        schedule(interval);
        logger.error("AI summary generation failed: %s", persisted.lastError);
      })
      .finally(() => {
        activePromise = null;
        store.write(persisted);
      });

    return {
      accepted: true,
      state: "running",
      cooldownUntilJST: persisted.manualCooldownUntilJST,
    };
  }

  function getPublicState() {
    const publicRecord =
      runtimeState === "stale" && persisted.latest ? persisted.latest : runtimeAnalysis || persisted.latest;
    return structuredClone({
      state: runtimeState,
      severity: publicRecord?.severity || "unknown",
      dataQuality: runtimeState === "stale" ? "stale" : publicRecord?.dataQuality || "insufficient",
      generatedAtJST: persisted.latest?.generatedAtJST || null,
      nextScheduledAtJST: persisted.nextScheduledAtJST,
      sourceCoverage: publicRecord?.sourceCoverage || { valid: 0, total: 4 },
      sourceFreshness: publicRecord?.sourceFreshness || {},
      summary: persisted.latest?.summary || null,
      metricDisplay: persisted.latest?.metricDisplay || {},
      cooldownUntilJST: persisted.manualCooldownUntilJST,
      lastError: persisted.lastError,
    });
  }

  function stop() {
    stopped = true;
    if (timer) {
      timers.clearTimeout(timer);
      timer = null;
    }
  }

  return { initialize, getPublicState, requestRefresh, stop };
}
