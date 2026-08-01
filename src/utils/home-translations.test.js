import { expect, it } from "vitest";
import nextI18nextConfig from "../../next-i18next.config";

import { loadHomeTranslations } from "./home-translations";

const EXPECTED_TITLES = {
  en: "AI Executive Summary",
  ja: "AI 経営サマリー",
  "zh-Hans": "AI 经营总结",
};

it.each(["en", "ja"])("loads real fixed cockpit resources for an initial %s locale", async (initialLocale) => {
  const result = await loadHomeTranslations(initialLocale);
  const { initialI18nStore } = result._nextI18Next;

  for (const [locale, title] of Object.entries(EXPECTED_TITLES)) {
    expect(initialI18nStore[locale].common.uoaisummary.title).toBe(title);
  }
  expect(result._nextI18Next.initialLocale).toBe(initialLocale);
  expect(result._nextI18Next.userConfig).toBeNull();
  expect(nextI18nextConfig.i18n.locales).toEqual(["en"]);
});
