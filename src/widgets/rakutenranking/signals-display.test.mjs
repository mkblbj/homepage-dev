import assert from "node:assert/strict";
import test from "node:test";

import { buildSignalPanelState } from "./signals-display.mjs";

test("hidden when signal feature is disabled", () => {
  assert.deepEqual(buildSignalPanelState({ enabled: false }), {
    visible: false,
    mode: "hidden",
    statusLabel: "",
    message: "",
    signals: [],
  });
});

test("shows loading state before signal data arrives", () => {
  assert.deepEqual(buildSignalPanelState({ enabled: true }), {
    visible: true,
    mode: "loading",
    statusLabel: "確認中",
    message: "实时榜を確認中",
    signals: [],
  });
});

test("shows rate limit state when proxy returns an error payload", () => {
  assert.deepEqual(
    buildSignalPanelState({
      enabled: true,
      data: {
        error: "Failed to fetch ranking: Rakuten API returned incomplete realtime ranking data",
      },
    }),
    {
      visible: true,
      mode: "error",
      statusLabel: "取得制限中",
      message: "乐天ランキングAPIの制限で一時的に取得できません",
      signals: [],
    },
  );
});

test("shows warmup state while baseline is being created", () => {
  assert.deepEqual(
    buildSignalPanelState({
      enabled: true,
      data: {
        enabled: true,
        warmingUp: true,
        signals: [],
      },
    }),
    {
      visible: true,
      mode: "warmup",
      statusLabel: "基線作成中",
      message: "現在の榜单を基準として記録中",
      signals: [],
    },
  );
});

test("shows monitoring state when there are no current signals", () => {
  assert.deepEqual(
    buildSignalPanelState({
      enabled: true,
      data: {
        enabled: true,
        warmingUp: false,
        config: { realtimeTop: 100 },
        signals: [],
      },
    }),
    {
      visible: true,
      mode: "empty",
      statusLabel: "監視中",
      message: "实时前100を監視中",
      signals: [],
    },
  );
});

test("shows signal list when signals are present", () => {
  const signals = [{ itemCode: "shop:item", status: "realtime_new" }];

  assert.deepEqual(
    buildSignalPanelState({
      enabled: true,
      data: {
        enabled: true,
        warmingUp: false,
        config: { realtimeTop: 50 },
        signals,
      },
    }),
    {
      visible: true,
      mode: "signals",
      statusLabel: "1件",
      message: "实时前50から検出",
      signals,
    },
  );
});
