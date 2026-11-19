import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { state } = vi.hoisted(() => ({ state: { dir: "" } }));

vi.mock("utils/config/config", () => ({
  get CONF_DIR() {
    return state.dir;
  },
}));

import handler from "pages/api/guide/rakuten-image/[name]";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const cached = (name) => join(state.dir, "cache", "rakuten-image-guide", name);

function upstream(body, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({
    ok,
    status,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  }));
}

describe("pages/api/guide/rakuten-image/[name]", () => {
  beforeEach(() => {
    state.dir = mkdtempSync(join(tmpdir(), "guide-img-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(state.dir, { recursive: true, force: true });
  });

  it("refuses any name outside the fixed list without fetching", async () => {
    const fetchMock = upstream(JPEG);
    vi.stubGlobal("fetch", fetchMock);

    for (const name of ["../services.yaml", "10_128_10.jpg", ["10_128_01.jpg"], undefined]) {
      const res = createMockRes();
      await handler({ method: "GET", query: { name } }, res);
      expect(res.statusCode).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches from Rakuten once, keeps a copy, and serves the copy afterwards", async () => {
    const fetchMock = upstream(JPEG);
    vi.stubGlobal("fetch", fetchMock);

    const first = createMockRes();
    await handler({ method: "GET", query: { name: "10_128_01.jpg" } }, first);
    expect(first.statusCode).toBe(200);
    expect(first.headers["Content-Type"]).toBe("image/jpeg");
    expect(Buffer.compare(first.body, JPEG)).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.rakuten.co.jp/shops/manual/navi3/rule/guide/img/10_128_01.jpg",
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(Buffer.compare(readFileSync(cached("10_128_01.jpg")), JPEG)).toBe(0);

    const second = createMockRes();
    await handler({ method: "GET", query: { name: "10_128_01.jpg" } }, second);
    expect(second.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves an existing copy without asking Rakuten", async () => {
    mkdirSync(join(state.dir, "cache", "rakuten-image-guide"), { recursive: true });
    writeFileSync(cached("10_128_09.jpg"), JPEG);
    const fetchMock = upstream(JPEG);
    vi.stubGlobal("fetch", fetchMock);

    const res = createMockRes();
    await handler({ method: "GET", query: { name: "10_128_09.jpg" } }, res);
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never caches a page that is not a JPEG, such as a login screen", async () => {
    vi.stubGlobal("fetch", upstream(Buffer.from("<html>login</html>")));

    const res = createMockRes();
    await handler({ method: "GET", query: { name: "10_128_02.jpg" } }, res);
    expect(res.statusCode).toBe(502);
    expect(existsSync(cached("10_128_02.jpg"))).toBe(false);
  });

  it("answers 502 when Rakuten fails or cannot be reached", async () => {
    vi.stubGlobal("fetch", upstream(JPEG, { ok: false, status: 503 }));
    const failed = createMockRes();
    await handler({ method: "GET", query: { name: "10_128_03.jpg" } }, failed);
    expect(failed.statusCode).toBe(502);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const offline = createMockRes();
    await handler({ method: "GET", query: { name: "10_128_03.jpg" } }, offline);
    expect(offline.statusCode).toBe(502);
  });

  it("only allows GET and HEAD", async () => {
    const res = createMockRes();
    await handler({ method: "POST", query: { name: "10_128_01.jpg" } }, res);
    expect(res.statusCode).toBe(405);
  });
});
