import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  // Node-environment tests shouldn't require jsdom; guard cleanup accordingly.
  if (typeof document !== "undefined") cleanup();
});

// implement common formatters and fixed-language labels mocked in next-i18next
vi.mock("next-i18next/pages", () => {
  const cockpitByLocale = {
    ja: {
      title: "AI 経営サマリー",
      subtitle: "全社データをもとに1時間ごとに更新",
      updatedAt: "生成時刻",
      nextUpdate: "次回",
      reanalyze: "AI再分析",
      switchToChinese: "中文",
      switchToJapanese: "日本語",
      showDetails: "詳細を見る",
      hideDetails: "詳細を閉じる",
      analyzing: "AI分析中",
      analyzingFirst: "最初のサマリーを生成しています",
      noSummary: "AIサマリーはまだありません",
      waiting: "初回分析を開始してください",
      stale: "前回の結果を表示中",
      partial: "一部データで分析",
      cooldown: "再分析はしばらくお待ちください",
      refreshFailed: "再分析を開始できませんでした",
      cannotGenerate: "AIサマリーを生成できません",
      insufficient: "分析に必要なデータが不足しています",
      reviewThemes: "低評価レビューの傾向",
      coverage: "データカバレッジ",
      "source.shipping": "出荷",
      "source.attention": "運営対応",
      "source.sales": "楽天売上",
      "source.performance": "経営表現",
      "sourceState.fresh": "最新",
      "sourceState.delayed": "遅延",
      "sourceState.stale": "期限切れ",
      "sourceState.unavailable": "取得不可",
      "severity.normal": "正常",
      "severity.attention": "注意",
      "severity.critical": "重要",
      "severity.unknown": "判定不可",
      "priority.high": "最優先",
      "priority.medium": "優先",
      "priority.low": "確認",
    },
    "zh-Hans": {
      title: "AI 经营总结",
      subtitle: "基于全公司数据，每小时更新",
      updatedAt: "生成时间",
      nextUpdate: "下次更新",
      reanalyze: "AI重新分析",
      switchToChinese: "中文",
      switchToJapanese: "日本語",
      showDetails: "查看详情",
      hideDetails: "收起详情",
      analyzing: "AI分析中",
      analyzingFirst: "正在生成首份总结",
      noSummary: "暂无AI总结",
      waiting: "请开始首次分析",
      stale: "正在显示上次结果",
      partial: "基于部分数据分析",
      cooldown: "请稍后再重新分析",
      refreshFailed: "无法开始重新分析",
      cannotGenerate: "无法生成AI总结",
      insufficient: "缺少分析所需的数据",
      reviewThemes: "低评分评价趋势",
      coverage: "数据覆盖",
      "source.shipping": "发货",
      "source.attention": "运营待办",
      "source.sales": "乐天销售",
      "source.performance": "经营表现",
      "sourceState.fresh": "最新",
      "sourceState.delayed": "延迟",
      "sourceState.stale": "已过期",
      "sourceState.unavailable": "不可用",
      "severity.normal": "正常",
      "severity.attention": "关注",
      "severity.critical": "重要",
      "severity.unknown": "无法判断",
      "priority.high": "最高优先",
      "priority.medium": "优先",
      "priority.low": "确认",
    },
    en: {
      title: "AI Executive Summary",
      subtitle: "Updated hourly from company-wide data",
      updatedAt: "Generated",
      nextUpdate: "Next update",
      reanalyze: "Reanalyze",
      switchToChinese: "Chinese",
      switchToJapanese: "Japanese",
      showDetails: "View details",
      hideDetails: "Hide details",
      analyzing: "AI analysis in progress",
      analyzingFirst: "Generating the first summary",
      noSummary: "No AI summary yet",
      waiting: "Start the first analysis",
      stale: "Showing the previous result",
      partial: "Analysis uses partial data",
      cooldown: "Please wait before reanalyzing",
      refreshFailed: "Could not start reanalysis",
      cannotGenerate: "Could not generate an AI summary",
      insufficient: "Not enough data to analyze",
      reviewThemes: "Low-rating review themes",
      coverage: "Data coverage",
      "source.shipping": "Shipping",
      "source.attention": "Operations",
      "source.sales": "Rakuten sales",
      "source.performance": "Performance",
      "sourceState.fresh": "Fresh",
      "sourceState.delayed": "Delayed",
      "sourceState.stale": "Stale",
      "sourceState.unavailable": "Unavailable",
      "severity.normal": "Normal",
      "severity.attention": "Attention",
      "severity.critical": "Critical",
      "severity.unknown": "Unknown",
      "priority.high": "Highest",
      "priority.medium": "Priority",
      "priority.low": "Review",
    },
  };
  const translate = (locale, key, opts) => {
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
    const cockpitKey =
      typeof key === "string" && key.startsWith("uoaisummary.") ? key.slice("uoaisummary.".length) : null;
    return (cockpitKey && cockpitByLocale[locale]?.[cockpitKey]) || key;
  };

  return {
    appWithTranslation: (Component) => Component,
    useTranslation: () => ({
      i18n: {
        language: "en",
        getFixedT: (locale) => (key, opts) => translate(locale, key, opts),
      },
      t: (key, opts) => translate("en", key, opts),
    }),
  };
});
