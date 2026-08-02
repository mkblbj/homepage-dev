import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

import nextI18nextConfig from "../../next-i18next.config";

const HOME_UI_LOCALES = ["en", "ja", "zh-Hans"];

function homeTranslationConfig(initialLocale) {
  return {
    ...nextI18nextConfig,
    i18n: {
      ...nextI18nextConfig.i18n,
      locales: [...new Set([...nextI18nextConfig.i18n.locales, initialLocale, ...HOME_UI_LOCALES])],
    },
  };
}

export function loadHomeTranslations(initialLocale) {
  return serverSideTranslations(initialLocale, ["common"], homeTranslationConfig(initialLocale), HOME_UI_LOCALES);
}
