// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GUIDE_CONTENT, GUIDE_SECTIONS } from "./content";
import { GUIDE_IMAGES } from "./images.mjs";

const { router } = vi.hoisted(() => ({
  router: { pathname: "/guide/rakuten-image", query: {}, replace: vi.fn() },
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("next/head", () => ({ default: () => null }));

import RakutenImageGuidePage, { getServerSideProps } from "pages/guide/rakuten-image";

function imagesOf(content) {
  return [
    ...content.text.examples.map((e) => e.image),
    ...content.border.cases.map((c) => c.image),
    content.bg.figure.image,
    content.bg.warn.image,
  ];
}

describe("Rakuten image guide content", () => {
  it("has the same sections and the same judgements in both languages", () => {
    const { zh, ja } = GUIDE_CONTENT;
    for (const id of GUIDE_SECTIONS) {
      expect(zh[id]?.title, id).toBeTruthy();
      expect(ja[id]?.title, id).toBeTruthy();
    }
    expect(ja.result.rows.map((r) => r.kind)).toEqual(zh.result.rows.map((r) => r.kind));
    expect(ja.symbols.rows.map((r) => [r.marks, r.verdict])).toEqual(zh.symbols.rows.map((r) => [r.marks, r.verdict]));
    expect(ja.border.boundary.map((b) => b.kind)).toEqual(zh.border.boundary.map((b) => b.kind));
    expect(ja.bg.figure.rows.map((r) => r.kind)).toEqual(zh.bg.figure.rows.map((r) => r.kind));
    expect(imagesOf(ja)).toEqual(imagesOf(zh));
  });

  it("uses every official example image exactly once per language", () => {
    for (const content of Object.values(GUIDE_CONTENT)) {
      expect([...imagesOf(content)].sort()).toEqual([...GUIDE_IMAGES].sort());
    }
  });
});

describe("pages/guide/rakuten-image", () => {
  beforeEach(() => {
    router.query = {};
    router.replace.mockClear();
    window.history.pushState({}, "", "/guide/rakuten-image");
    document.cookie = "guide_lang=; Path=/guide; Max-Age=0";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("picks the language on the server from the link, the cookie or the browser", async () => {
    const props = (query, headers = {}) => getServerSideProps({ query, req: { headers } }).then((r) => r.props);
    await expect(props({ lang: "ja" })).resolves.toEqual({ initialLang: "ja" });
    await expect(props({}, { cookie: "guide_lang=ja" })).resolves.toEqual({ initialLang: "ja" });
    await expect(props({}, { "accept-language": "ja-JP,ja;q=0.9" })).resolves.toEqual({ initialLang: "ja" });
    await expect(props({})).resolves.toEqual({ initialLang: "zh" });
  });

  it("renders every section with a matching entry in the side navigation", () => {
    const { container } = render(<RakutenImageGuidePage initialLang="zh" />);

    expect(screen.getByRole("heading", { level: 1, name: "乐天首图与 SKU 图判定指南" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "目录" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(GUIDE_SECTIONS.map((id) => `#${id}`));
    for (const id of GUIDE_SECTIONS) {
      expect(container.querySelector(`section#${id}`), id).not.toBeNull();
    }
  });

  it("marks the section being read in the navigation as the page scrolls", async () => {
    // jsdom has no layout: place the sections 1000px apart and scroll by moving them up.
    let scrolled = 0;
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(20000);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      const index = GUIDE_SECTIONS.indexOf(this.id);
      const top = index < 0 ? 0 : 400 + index * 1000 - scrolled;
      return { top, bottom: top + 900, left: 0, right: 0, width: 0, height: 900, x: 0, y: top };
    });

    render(<RakutenImageGuidePage initialLang="zh" />);
    const nav = screen.getByRole("navigation", { name: "目录" });
    const current = () =>
      within(nav)
        .getAllByRole("link")
        .filter((a) => a.getAttribute("aria-current"));

    expect(current().map((a) => a.getAttribute("href"))).toEqual(["#checklist"]);

    scrolled = 3400;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => expect(current().map((a) => a.getAttribute("href"))).toEqual(["#text"]));
  });

  it("loads the example images through the local image route, each with a description", () => {
    render(<RakutenImageGuidePage initialLang="zh" />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(GUIDE_IMAGES.length);
    for (const image of images) {
      expect(image.getAttribute("src")).toMatch(/^\/api\/guide\/rakuten-image\/10_128_0\d\.jpg$/);
      expect(image.getAttribute("alt")).toBeTruthy();
    }
  });

  it("switches language in place and remembers the choice", () => {
    render(<RakutenImageGuidePage initialLang="zh" />);

    fireEvent.click(screen.getByRole("button", { name: "日本語" }));

    expect(screen.getByRole("heading", { level: 1, name: "楽天市場の商品画像判定ガイド" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "目次" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "true");
    expect(document.cookie).toContain("guide_lang=ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps a shared ?lang= address in step with the switch", () => {
    router.query = { lang: "ja" };
    render(<RakutenImageGuidePage initialLang="ja" />);

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(router.replace).toHaveBeenCalledWith(
      { pathname: "/guide/rakuten-image", query: { lang: "zh" } },
      undefined,
      { shallow: true, scroll: false },
    );
  });
});
