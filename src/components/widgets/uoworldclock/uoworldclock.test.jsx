// @vitest-environment jsdom

import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

import UoWorldClock from "./uoworldclock";

const JP_OPTIONS = {
  label: "🇯🇵",
  locale: "ja",
  timeZone: "Asia/Tokyo",
  workHours: "9:00-18:00",
  dayHours: "6:00-22:00",
  workdays: [0, 1, 2, 3, 4, 5, 6],
  dateFormat: { weekday: "short", month: "numeric", day: "numeric" },
  stateLabels: { working: "勤務中", daytime: "日中", night: "夜間" },
};

const UK_OPTIONS = {
  label: "🇬🇧",
  locale: "en-GB",
  timeZone: "Europe/London",
  workHours: "9:00-17:30",
  dayHours: "6:00-22:00",
  workdays: [0, 1, 2, 3, 4, 5, 6],
  dateFormat: { weekday: "short", month: "short", day: "numeric" },
  stateLabels: { working: "at work", daytime: "daytime", night: "off hours" },
};

function renderAt(iso, options) {
  vi.setSystemTime(new Date(iso));
  return renderWithProviders(<UoWorldClock options={options} />, { settings: { target: "_self" } });
}

describe("components/widgets/uoworldclock", () => {
  it("exposes the class config/custom.js anchors the sale reminder to", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      expect(container.querySelector(".information-widget-uoworldclock")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the label, time and date", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      expect(screen.getByText("🇯🇵")).toBeInTheDocument();
      expect(container.textContent).toContain("11:15");
      expect(container.textContent).toContain("42");
      expect(container.textContent).toContain("勤務中");
    } finally {
      vi.useRealTimers();
    }
  });

  it("places dayPeriod before the hour in ja and after the seconds in en-GB", () => {
    vi.useFakeTimers();
    try {
      // 同一时刻：日本 11:15 午前，英国 03:15 am
      const jp = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      const jpText = jp.container.querySelector(".uoworldclock-time").textContent;
      expect(jpText.indexOf("午前")).toBeLessThan(jpText.indexOf("11"));
      jp.unmount();

      const uk = renderAt("2026-08-13T11:15:42+09:00", UK_OPTIONS);
      const ukText = uk.container.querySelector(".uoworldclock-time").textContent;
      expect(ukText.indexOf("am")).toBeGreaterThan(ukText.indexOf("15"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the hour unpadded in 12-hour form", () => {
    vi.useFakeTimers();
    try {
      // 英国当地 03:15，应渲染成 3:15 而不是 03:15
      const { container } = renderAt("2026-08-13T11:15:42+09:00", UK_OPTIONS);
      const timeText = container.querySelector(".uoworldclock-time").textContent;
      expect(timeText).toContain("3:15");
      expect(timeText).not.toContain("03:15");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders seconds and dayPeriod smaller than hours and minutes", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      const primary = container.querySelectorAll(".uoworldclock-time .uoworldclock-primary");
      const secondary = container.querySelectorAll(".uoworldclock-time .uoworldclock-secondary");
      // 主号至少含 hour、literal(:)、minute 三段；次号至少含 dayPeriod、literal(:)、second
      expect(primary.length).toBeGreaterThanOrEqual(3);
      expect(secondary.length).toBeGreaterThanOrEqual(3);
      expect([...primary].map((el) => el.textContent).join("")).toBe("11:15");
      expect([...secondary].map((el) => el.textContent).join("")).toBe("午前:42");
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches the state line colour across the three states", () => {
    vi.useFakeTimers();
    try {
      const working = renderAt("2026-08-13T11:15:00+09:00", JP_OPTIONS);
      expect(working.container.querySelector(".uoworldclock-line").className).toContain("emerald");
      working.unmount();

      const daytime = renderAt("2026-08-13T20:40:00+09:00", JP_OPTIONS);
      expect(daytime.container.querySelector(".uoworldclock-line").className).toContain("amber");
      daytime.unmount();

      const night = renderAt("2026-08-13T23:30:00+09:00", JP_OPTIONS);
      expect(night.container.querySelector(".uoworldclock-line").className).toContain("slate");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the date in the configured locale", () => {
    vi.useFakeTimers();
    try {
      const jp = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      expect(jp.container.textContent).toContain("木");
      jp.unmount();

      const uk = renderAt("2026-08-13T11:15:42+09:00", UK_OPTIONS);
      expect(uk.container.textContent).toContain("Thu");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders an inline SVG flag instead of text when flag is configured", () => {
    vi.useFakeTimers();
    try {
      // Windows 的 Segoe UI Emoji 不含国旗字形，会把 🇯🇵 降级成 JP 两个字母，
      // 因此改用内联 SVG 保证跨平台一致
      const { container } = renderAt("2026-08-13T11:15:42+09:00", { ...JP_OPTIONS, flag: "jp" });
      expect(container.querySelector(".uoworldclock-flag svg")).not.toBeNull();
      expect(screen.queryByText("🇯🇵")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the text label when no flag is configured", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      expect(screen.getByText("🇯🇵")).toBeInTheDocument();
      expect(container.querySelector(".uoworldclock-flag svg")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives every flag instance its own clipPath ids", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-13T11:15:42+09:00"));
      // 英国旗需要 clipPath；两个实例同页渲染时 id 若相同，后一面旗会被前一面的裁剪路径污染
      const { container } = renderWithProviders(
        <>
          <UoWorldClock options={{ ...UK_OPTIONS, flag: "gb" }} />
          <UoWorldClock options={{ ...UK_OPTIONS, flag: "gb" }} />
        </>,
        { settings: { target: "_self" } },
      );

      const ids = [...container.querySelectorAll("clipPath")].map((el) => el.id);
      expect(ids.length).toBeGreaterThanOrEqual(4);
      expect(new Set(ids).size).toBe(ids.length);
      // url(#id) 里的冒号会被当作伪类解析，useId 的原始值必须清洗过
      expect(ids.every((id) => !id.includes(":"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an unknown flag code and keeps the text label", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderAt("2026-08-13T11:15:42+09:00", { ...JP_OPTIONS, flag: "zz" });
      expect(container.querySelector(".uoworldclock-flag svg")).toBeNull();
      expect(screen.getByText("🇯🇵")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ticks every second", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderAt("2026-08-13T11:15:42+09:00", JP_OPTIONS);
      const before = container.querySelector(".uoworldclock-time").textContent;

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(container.querySelector(".uoworldclock-time").textContent).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
