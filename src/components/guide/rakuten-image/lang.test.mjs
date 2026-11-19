import assert from "node:assert/strict";
import test from "node:test";

import { guideLangCookie, resolveGuideLang } from "./lang.mjs";

test("a ?lang= link wins over everything else", () => {
  assert.equal(resolveGuideLang({ query: { lang: "ja" }, cookie: "guide_lang=zh", acceptLanguage: "zh-CN" }), "ja");
  assert.equal(resolveGuideLang({ query: { lang: ["zh", "ja"] }, acceptLanguage: "ja" }), "zh");
});

test("an unknown ?lang= falls through to the reader's saved choice", () => {
  assert.equal(resolveGuideLang({ query: { lang: "en" }, cookie: "theme=dark; guide_lang=ja" }), "ja");
});

test("the saved choice wins over the browser language", () => {
  assert.equal(resolveGuideLang({ cookie: "guide_lang=zh", acceptLanguage: "ja-JP,ja;q=0.9" }), "zh");
});

test("the browser language picks the highest-ranked of Chinese and Japanese", () => {
  assert.equal(resolveGuideLang({ acceptLanguage: "ja-JP,ja;q=0.9,zh-CN;q=0.8" }), "ja");
  assert.equal(resolveGuideLang({ acceptLanguage: "en-US,en;q=0.9,zh-TW;q=0.8,ja;q=0.7" }), "zh");
  assert.equal(resolveGuideLang({ acceptLanguage: "en;q=1,ja;q=0.2,zh;q=0.5" }), "zh");
});

test("Chinese when nothing says otherwise", () => {
  assert.equal(resolveGuideLang({}), "zh");
  assert.equal(resolveGuideLang({ acceptLanguage: "en-US,fr;q=0.5", cookie: "guide_lang=xx" }), "zh");
  assert.equal(resolveGuideLang(), "zh");
});

test("the cookie only ever stores a known language", () => {
  assert.equal(guideLangCookie("ja"), "guide_lang=ja; Path=/guide; Max-Age=31536000; SameSite=Lax");
  assert.equal(guideLangCookie("<script>"), "guide_lang=zh; Path=/guide; Max-Age=31536000; SameSite=Lax");
});
