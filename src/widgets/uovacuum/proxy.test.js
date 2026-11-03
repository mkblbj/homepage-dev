import { beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { httpProxy, getServiceWidget, logger } = vi.hoisted(() => ({
  httpProxy: vi.fn(),
  getServiceWidget: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock("utils/logger", () => ({
  default: () => logger,
}));
vi.mock("utils/config/service-helpers", () => ({
  default: getServiceWidget,
}));
vi.mock("utils/proxy/http", () => ({
  httpProxy,
}));

import uoVacuumProxyHandler from "./proxy";

const DEVICE = "xiaomi_sg_1067980063_c102gl";
const CONFIG = { url: "http://ha.example.test:8123/", key: "secret-token", device: DEVICE };
const SAME_ORIGIN = { origin: "http://home.example.test:3000", host: "home.example.test:3000" };

function stateRequest(method = "GET") {
  return { method, query: { group: "g", service: "s", endpoint: "state" }, headers: {}, socket: {} };
}

function actionRequest(body, headers = SAME_ORIGIN) {
  return { method: "POST", query: { group: "g", service: "s", endpoint: "action" }, headers, body, socket: {} };
}

const HA_STATES = [
  { entity_id: `vacuum.${DEVICE}`, state: "docked", last_updated: "2026-11-03T04:51:46.000Z" },
  { entity_id: `sensor.${DEVICE}_battery_level_p_3_1`, state: "98" },
  { entity_id: `sensor.${DEVICE}_task_status_p_4_7`, state: "0" },
];

describe("widgets/uovacuum/proxy state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceWidget.mockResolvedValue(CONFIG);
  });

  it("reads HA's states with the server-side token and returns the card model", async () => {
    httpProxy.mockResolvedValueOnce([200, "application/json", Buffer.from(JSON.stringify(HA_STATES))]);
    const res = createMockRes();

    await uoVacuumProxyHandler(stateRequest(), res);

    expect(httpProxy).toHaveBeenCalledWith(
      "http://ha.example.test:8123/api/states",
      expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer secret-token" } }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "docked", battery: 98 });
    expect(res.headers["Cache-Control"]).toBe("private, no-store");
  });

  it("reports HA being unreachable without echoing the token", async () => {
    httpProxy.mockResolvedValueOnce([401, "text/plain", Buffer.from("401: Unauthorized")]);
    const res = createMockRes();

    await uoVacuumProxyHandler(stateRequest(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "home_assistant_unavailable" });
    expect(JSON.stringify(res.body)).not.toContain("secret-token");
  });

  it("gives up on a Home Assistant that never answers", async () => {
    vi.useFakeTimers();
    httpProxy.mockReturnValueOnce(new Promise(() => {}));
    const res = createMockRes();

    const handled = uoVacuumProxyHandler(stateRequest(), res);
    await vi.advanceTimersByTimeAsync(8001);
    await handled;
    vi.useRealTimers();

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "home_assistant_unavailable" });
  });

  it("reports HA sending something that is not a list of states", async () => {
    httpProxy.mockResolvedValueOnce([200, "text/html", Buffer.from("<html>")]);
    const res = createMockRes();

    await uoVacuumProxyHandler(stateRequest(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "home_assistant_unavailable" });
  });

  it("only reads state with GET", async () => {
    const res = createMockRes();

    await uoVacuumProxyHandler(stateRequest("POST"), res);

    expect(res.statusCode).toBe(405);
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("refuses to run without a token or with a device slug that could name another entity", async () => {
    for (const config of [
      { ...CONFIG, key: undefined },
      { ...CONFIG, url: undefined },
      { ...CONFIG, device: "a/b" },
    ]) {
      getServiceWidget.mockResolvedValueOnce(config);
      const res = createMockRes();

      await uoVacuumProxyHandler(stateRequest(), res);

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: "configuration" });
    }
    expect(httpProxy).not.toHaveBeenCalled();
  });
});

describe("widgets/uovacuum/proxy action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceWidget.mockResolvedValue(CONFIG);
    httpProxy.mockResolvedValue([200, "application/json", Buffer.from("[]")]);
  });

  it("presses stop-clean for 停止", async () => {
    const res = createMockRes();

    await uoVacuumProxyHandler(actionRequest({ action: "stop" }), res);

    expect(httpProxy).toHaveBeenCalledWith(
      "http://ha.example.test:8123/api/services/button/press",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: `button.${DEVICE}_stop_clean_a_4_2` }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("accepts a body Next left as a string", async () => {
    const res = createMockRes();

    await uoVacuumProxyHandler(actionRequest('{"action":"suction","value":"quiet"}'), res);

    expect(httpProxy).toHaveBeenCalledWith(
      "http://ha.example.test:8123/api/services/select/select_option",
      expect.objectContaining({
        body: JSON.stringify({ entity_id: `select.${DEVICE}_mode_p_2_3`, option: "安静/静音" }),
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it("rejects broken JSON and actions outside the allowlist without calling HA", async () => {
    for (const body of ["{bad", { action: "reset" }, { action: "suction", value: "turbo" }, null]) {
      const res = createMockRes();

      await uoVacuumProxyHandler(actionRequest(body), res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "unsupported_action" });
    }
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("refuses cross-site requests", async () => {
    for (const headers of [
      { host: "home.example.test:3000" },
      { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" },
      { origin: "https://evil.example.test", host: "home.example.test:3000" },
    ]) {
      const res = createMockRes();

      await uoVacuumProxyHandler(actionRequest({ action: "start" }, headers), res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "cross_site_request" });
    }
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("only acts on POST", async () => {
    const res = createMockRes();

    await uoVacuumProxyHandler({ ...actionRequest({ action: "start" }), method: "GET" }, res);

    expect(res.statusCode).toBe(405);
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("gives up on a command Home Assistant never answers", async () => {
    vi.useFakeTimers();
    httpProxy.mockReturnValueOnce(new Promise(() => {}));
    const res = createMockRes();

    const handled = uoVacuumProxyHandler(actionRequest({ action: "start" }), res);
    await vi.advanceTimersByTimeAsync(8001);
    await handled;
    vi.useRealTimers();

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "home_assistant_rejected" });
  });

  it("reports HA refusing the command", async () => {
    httpProxy.mockResolvedValueOnce([500, "text/plain", Buffer.from("500 Internal Server Error")]);
    const res = createMockRes();

    await uoVacuumProxyHandler(actionRequest({ action: "start" }), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "home_assistant_rejected" });
  });
});

describe("widgets/uovacuum/proxy endpoints", () => {
  it("answers 404 for an endpoint it does not serve", async () => {
    getServiceWidget.mockResolvedValue(CONFIG);
    const res = createMockRes();

    await uoVacuumProxyHandler(
      { method: "GET", query: { group: "g", service: "s", endpoint: "states" }, headers: {} },
      res,
    );

    expect(res.statusCode).toBe(404);
  });
});
