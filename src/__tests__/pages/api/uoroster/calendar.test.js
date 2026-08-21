import { beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { servicesFromConfig, httpProxy, logger } = vi.hoisted(() => ({
  servicesFromConfig: vi.fn(),
  httpProxy: vi.fn(),
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("utils/config/service-helpers", () => ({
  default: vi.fn(),
  servicesFromConfig,
}));

vi.mock("utils/proxy/http", () => ({ httpProxy }));

vi.mock("utils/logger", () => ({ default: () => logger }));

import handler from "pages/api/uoroster/calendar";

const CONFIGURED_GROUPS = [
  {
    name: "Core",
    services: [
      {
        name: "Attendance",
        widget: {
          type: "uoattendance",
          rosterCalendarUrl: "https://hr.example.com",
          rosterCalendarToken: "KEY:SECRET",
        },
      },
    ],
    groups: [],
  },
];

describe("pages/api/uoroster/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servicesFromConfig.mockResolvedValue(CONFIGURED_GROUPS);
  });

  it("returns the HR calendar HTML for a valid department", async () => {
    httpProxy.mockResolvedValue([
      200,
      "application/json",
      Buffer.from(JSON.stringify({ message: "<!DOCTYPE html><html><body>月历</body></html>" })),
    ]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(httpProxy).toHaveBeenCalledWith(
      "https://hr.example.com/api/method/work_roster.api.published_calendar.get_current_month_calendar" +
        "?department_category=Production",
      {
        headers: {
          Authorization: "token KEY:SECRET",
          Accept: "application/json",
        },
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(res.headers["Cache-Control"]).toBe("private, max-age=300");
    expect(res.body).toBe("<!DOCTYPE html><html><body>月历</body></html>");
  });

  it("passes the Office department through to HR", async () => {
    httpProxy.mockResolvedValue([200, "application/json", Buffer.from(JSON.stringify({ message: "<html></html>" }))]);

    await handler({ method: "GET", query: { department: "Office" } }, createMockRes());

    expect(httpProxy.mock.calls[0][0]).toContain("department_category=Office");
  });

  it("rejects a department outside the whitelist", async () => {
    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Warehouse" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods", async () => {
    const res = createMockRes();
    await handler({ method: "POST", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(["GET"]);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("explains what to configure when credentials are missing", async () => {
    servicesFromConfig.mockResolvedValue([{ name: "Core", services: [], groups: [] }]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain("rosterCalendarUrl");
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("maps an upstream failure to 502 without leaking the token", async () => {
    httpProxy.mockResolvedValue([401, "application/json", Buffer.from("{}")]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("SECRET");
    expect(logger.error).toHaveBeenCalled();
  });

  it("maps a thrown httpProxy error (e.g. an invalid rosterCalendarUrl) to 502 without leaking the token", async () => {
    httpProxy.mockRejectedValue(new TypeError("Invalid URL"));

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(res.body).not.toContain("SECRET");
    expect(res.body).not.toContain("hr.example.com");
    expect(logger.error).toHaveBeenCalled();
  });

  it("maps a response without a message field to 502", async () => {
    httpProxy.mockResolvedValue([200, "application/json", Buffer.from(JSON.stringify({ data: "nope" }))]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
  });

  it("maps unparseable upstream payloads to 502", async () => {
    httpProxy.mockResolvedValue([200, "text/html", Buffer.from("<html>not json</html>")]);

    const res = createMockRes();
    await handler({ method: "GET", query: { department: "Production" } }, res);

    expect(res.statusCode).toBe(502);
  });
});
