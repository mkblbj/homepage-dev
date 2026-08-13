// @vitest-environment jsdom

import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

import DateTime from "./datetime";

describe("components/widgets/datetime", () => {
  it("renders formatted date/time and updates on an interval", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));

      const format = { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" };
      const expected0 = new Intl.DateTimeFormat("en-US", format).format(new Date());

      renderWithProviders(<DateTime options={{ locale: "en-US", format }} />, { settings: { target: "_self" } });

      // `render` wraps in `act`, so effects should flush synchronously.
      expect(screen.getByText(expected0)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const expected1 = new Intl.DateTimeFormat("en-US", format).format(new Date());

      expect(screen.getByText(expected1)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the label next to the time when the label option is provided", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));

      const format = { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" };
      const expected = new Intl.DateTimeFormat("en-US", format).format(new Date());

      renderWithProviders(<DateTime options={{ locale: "en-US", format, label: "🇬🇧 英国" }} />, {
        settings: { target: "_self" },
      });

      expect(screen.getByText("🇬🇧 英国")).toBeInTheDocument();
      expect(screen.getByText(expected)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders no extra element when the label option is absent", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));

      const format = { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" };
      const { container } = renderWithProviders(<DateTime options={{ locale: "en-US", format }} />, {
        settings: { target: "_self" },
      });

      expect(container.querySelectorAll(".information-widget-datetime span")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
