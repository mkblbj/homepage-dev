import { beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

import { marketDeviceModels } from "./device-sales.fixtures.mjs";

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

import uoRakutenSalesProxyHandler from "./proxy";

function request(endpoint, query) {
  return {
    method: "GET",
    query: {
      group: "楽天サービス",
      service: "楽天売上リアルタイム",
      index: "0",
      endpoint,
      ...(query ? { query } : {}),
    },
  };
}

describe("widgets/uorakutensales/proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceWidget.mockResolvedValue({ type: "uorakutensales", url: "http://127.0.0.1:3912" });
    httpProxy.mockResolvedValue([200, "application/json", Buffer.from(JSON.stringify(marketDeviceModels()))]);
  });

  it("picks the requested model's evidence out of the market reference", async () => {
    const res = createMockRes();

    await uoRakutenSalesProxyHandler(request("marketEvidence", JSON.stringify({ model: "iPhone 18 Pro" })), res);

    expect(httpProxy.mock.calls[0][0].toString()).toBe("http://127.0.0.1:3912/api/market-rankings/device-models");
    expect(res.statusCode).toBe(200);
    expect(res.body.model).toBe("iPhone 18 Pro");
    expect(res.body.total).toBe(5);
    expect(res.body.items[0].id).toBe("rakuten:560271:daily|odd:1");
  });

  it("answers 400 to an evidence request without a model, before reading the server", async () => {
    const res = createMockRes();

    await uoRakutenSalesProxyHandler(request("marketEvidence"), res);

    expect(res.statusCode).toBe(400);
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("hands the board the market ranking without its evidence", async () => {
    const res = createMockRes();

    await uoRakutenSalesProxyHandler(request("market"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.evidence).toBeUndefined();
    expect(res.body.ranks).toHaveLength(5);
  });
});
