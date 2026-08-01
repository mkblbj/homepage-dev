import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  // Node-environment tests shouldn't require jsdom; guard cleanup accordingly.
  if (typeof document !== "undefined") cleanup();
});

// implement common formatters and fixed-language labels mocked in next-i18next
vi.mock("next-i18next/pages", () => {
  const translate = (key, opts) => {
    const known = {
      "uoaisummary.title": "AI 経営サマリー",
      "uoaisummary.updatedAt": "生成時刻",
      "uoaisummary.switchToChinese": "中文",
      "uoaisummary.switchToJapanese": "日本語",
      "uoaisummary.showDetails": "詳細を見る",
      "uoaisummary.hideDetails": "詳細を閉じる",
      "uoaisummary.reanalyze": "AI再分析",
      "uoaisummary.analyzing": "AI分析中",
      "uoaisummary.stale": "前回の結果を表示中",
      "uoaisummary.partial": "一部データで分析",
      "uoaisummary.cooldown": "再分析はしばらくお待ちください",
      "uoaisummary.refreshFailed": "再分析を開始できませんでした",
      "uoaisummary.cannotGenerate": "AIサマリーを生成できません",
      "uoaisummary.insufficient": "分析に必要なデータが不足しています",
      "uoaisummary.coverage": "データカバレッジ",
    };
    if (
      [
        "common.number",
        "common.percent",
        "common.bytes",
        "common.bbytes",
        "common.byterate",
        "common.bibyterate",
        "common.bitrate",
        "common.duration",
        "common.ms",
        "common.date",
        "common.relativeDate",
      ].includes(key)
    ) {
      return String(opts?.value ?? "");
    }
    return known[key] || key;
  };

  return {
    appWithTranslation: (Component) => Component,
    useTranslation: () => ({
      i18n: {
        language: "en",
        getFixedT: () => translate,
      },
      t: translate,
    }),
  };
});
