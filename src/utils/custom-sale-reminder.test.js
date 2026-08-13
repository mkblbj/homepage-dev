// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

function createFixedDate(isoString) {
  const timestamp = Date.parse(isoString);

  return class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [timestamp]));
    }

    static now() {
      return timestamp;
    }

    static parse(value) {
      return Date.parse(value);
    }

    static UTC(...args) {
      return Date.UTC(...args);
    }
  };
}

function loadCustomScript() {
  const source = readFileSync("config/custom.js", "utf8");
  const context = vm.createContext({
    console,
    Date: createFixedDate("2026-07-07T12:00:00+09:00"),
    document,
    fetch: vi.fn(() => new Promise(() => {})),
    setInterval: vi.fn(),
    setTimeout,
    URLSearchParams,
  });

  vm.runInContext(source, context);

  return context;
}

describe("config/custom.js sale reminder", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="information-widgets-right">
        <div class="information-widget-datetime">2026/7/6月曜日 午後3:00:00</div>
        <div class="information-widget-datetime">Sunday, 6 July 2026 at 7:00:00 am</div>
      </div>
    `;
  });

  it("renders HR sale reminder together with the active Rakuten official campaign", () => {
    const context = loadCustomScript();

    context.renderSaleReminder(
      {
        is_sale_day: true,
        event: {
          title: "大型セール日",
          description: "注文大幅増加見込み",
          color: "#ef4444",
        },
      },
      {
        campaigns: [
          {
            name: "20260704_お買い物マラソン＆ジャンルSALE×ポイントアップ",
            startAtText: "2026/07/04(土) 20:00",
            endAtText: "2026/07/11(土) 01:59",
          },
        ],
      },
    );

    const reminder = document.getElementById("sale-event-reminder");
    expect(reminder).toHaveTextContent("本日は大型セール日");
    expect(reminder).toHaveTextContent("注文大幅増加見込み");
    expect(reminder).toHaveTextContent("楽天公式：お買い物マラソン＆ジャンルSALE開催中 · 7/11 01:59まで");
    expect(reminder?.nextElementSibling).toHaveClass("information-widget-datetime");
    // 提醒必须插在第一个（日本）时钟之前，否则页眉会变成「时钟 / 提醒 / 时钟」的错乱布局
    const host = document.getElementById("information-widgets-right");
    expect(host?.firstElementChild).toBe(reminder);
    expect(host?.children).toHaveLength(3);
  });

  it("retries temporary conflict responses before returning campaign data", async () => {
    const context = loadCustomScript();
    context.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, statusText: "Conflict" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, campaigns: [] }),
      });

    await expect(context.fetchJson("/api/campaigns", { retries: 1, retryDelayMs: 0 })).resolves.toEqual({
      ok: true,
      campaigns: [],
    });
    expect(context.fetch).toHaveBeenCalledTimes(2);
  });
});
