import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const EXPECTED = {
  ja: {
    noTodayShippingYet: "本日の出荷はまだありません",
    noTomorrowScheduleYet: "明日の予定はまだありません",
    waitingForUpdate: "更新を待機中",
    willAppearNextRefresh: "次回更新で反映されます",
  },
  en: {
    noTodayShippingYet: "No shipments yet today",
    noTomorrowScheduleYet: "No schedule for tomorrow yet",
    waitingForUpdate: "Waiting for update",
    willAppearNextRefresh: "Will appear after the next refresh",
  },
  "zh-CN": {
    noTodayShippingYet: "今日暂时没有出荷",
    noTomorrowScheduleYet: "明日暂时没有预定",
    waitingForUpdate: "等待更新",
    willAppearNextRefresh: "将在下次刷新后显示",
  },
};

for (const [locale, expectedKeys] of Object.entries(EXPECTED)) {
  test(`${locale} exposes the compact empty-state copy`, () => {
    const filePath = path.join(process.cwd(), "public", "locales", locale, "common.json");
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    assert.ok(json.uoshippingdashboard, `${locale} is missing uoshippingdashboard`);

    for (const [key, value] of Object.entries(expectedKeys)) {
      assert.equal(json.uoshippingdashboard[key], value, `${locale}.${key} mismatch`);
    }
  });
}
