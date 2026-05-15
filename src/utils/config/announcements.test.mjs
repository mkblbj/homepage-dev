import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ANNOUNCEMENT_ICON,
  DEFAULT_ANNOUNCEMENT_LABEL,
  DEFAULT_ANNOUNCEMENT_SPEED_SECONDS,
  normalizeAnnouncementConfig,
} from "./announcements.mjs";

test("disabled config returns a hidden banner with defaults", () => {
  const result = normalizeAnnouncementConfig({
    enabled: false,
    label: "社内通知",
    speedSeconds: 18,
    items: [
      {
        id: "ignored",
        enabled: true,
        text: "この公告は表示しない",
      },
    ],
  });

  assert.deepEqual(result, {
    enabled: false,
    label: "社内通知",
    speedSeconds: 18,
    items: [],
  });
});

test("enabled config normalizes active items and complete links", () => {
  const result = normalizeAnnouncementConfig({
    enabled: true,
    label: "お知らせ",
    speedSeconds: "36",
    items: [
      {
        id: "uo-ec-manager-0.2.1",
        enabled: true,
        text: "  请大家更新 uo-ec-manager 到最新版本 0.2.1。  ",
        icon: "🔔",
        links: [
          {
            label: " Mac ",
            href: " http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg ",
          },
          {
            label: "Win",
            href: "",
          },
        ],
      },
    ],
  });

  assert.equal(result.enabled, true);
  assert.equal(result.label, "お知らせ");
  assert.equal(result.speedSeconds, 36);
  assert.deepEqual(result.items, [
    {
      id: "uo-ec-manager-0.2.1",
      text: "请大家更新 uo-ec-manager 到最新版本 0.2.1。",
      icon: "🔔",
      links: [
        {
          label: "Mac",
          href: "http://192.168.1.26:3911/uo-ec-manager/uo-ec-manager-0.2.1-arm64.dmg",
        },
      ],
    },
  ]);
});

test("invalid items are filtered and no valid items disables the banner", () => {
  const result = normalizeAnnouncementConfig({
    enabled: true,
    items: [
      {
        id: "disabled",
        enabled: false,
        text: "disabled item",
      },
      {
        id: "empty",
        enabled: true,
        text: "   ",
      },
      null,
    ],
  });

  assert.deepEqual(result, {
    enabled: false,
    label: DEFAULT_ANNOUNCEMENT_LABEL,
    speedSeconds: DEFAULT_ANNOUNCEMENT_SPEED_SECONDS,
    items: [],
  });
});

test("missing optional fields fall back to stable defaults", () => {
  const result = normalizeAnnouncementConfig({
    enabled: true,
    label: "  ",
    speedSeconds: 4,
    items: [
      {
        enabled: true,
        text: "システムメンテナンスのお知らせ",
        links: "not an array",
      },
    ],
  });

  assert.deepEqual(result, {
    enabled: true,
    label: DEFAULT_ANNOUNCEMENT_LABEL,
    speedSeconds: DEFAULT_ANNOUNCEMENT_SPEED_SECONDS,
    items: [
      {
        id: "announcement-1",
        text: "システムメンテナンスのお知らせ",
        icon: DEFAULT_ANNOUNCEMENT_ICON,
        links: [],
      },
    ],
  });
});
