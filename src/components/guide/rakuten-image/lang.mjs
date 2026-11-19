// Which language the guide opens in: an explicit ?lang= link first, then the reader's last choice
// (a cookie, so the server renders the right language without a flash), then the browser's
// Accept-Language, and Chinese when nothing says otherwise.
export const GUIDE_LANGS = ["zh", "ja"];
export const GUIDE_LANG_COOKIE = "guide_lang";
export const DEFAULT_GUIDE_LANG = "zh";

function normalize(value) {
  const lang = String(value ?? "")
    .trim()
    .toLowerCase();
  if (lang === "zh" || lang.startsWith("zh-")) return "zh";
  if (lang === "ja" || lang.startsWith("ja-")) return "ja";
  return null;
}

function readCookie(cookieHeader, name) {
  for (const part of String(cookieHeader ?? "").split(";")) {
    const [key, ...rest] = part.split("=");
    if (key?.trim() === name) return decodeURIComponent(rest.join("=").trim());
  }
  return null;
}

function fromAcceptLanguage(header) {
  const ranked = String(header ?? "")
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: normalize(tag), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.lang && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked[0]?.lang ?? null;
}

export function resolveGuideLang({ query, cookie, acceptLanguage } = {}) {
  const asked = Array.isArray(query?.lang) ? query.lang[0] : query?.lang;
  return (
    normalize(asked) ??
    normalize(readCookie(cookie, GUIDE_LANG_COOKIE)) ??
    fromAcceptLanguage(acceptLanguage) ??
    DEFAULT_GUIDE_LANG
  );
}

export function guideLangCookie(lang) {
  const value = normalize(lang) ?? DEFAULT_GUIDE_LANG;
  return `${GUIDE_LANG_COOKIE}=${value}; Path=/guide; Max-Age=31536000; SameSite=Lax`;
}
