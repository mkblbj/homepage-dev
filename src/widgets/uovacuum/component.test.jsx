// @vitest-environment jsdom

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));

vi.mock("utils/proxy/use-widget-api", () => ({
  default: useWidgetAPI,
}));

import Component from "./component";

const mutate = vi.fn();

function model(overrides = {}) {
  return {
    status: "charging",
    battery: 98,
    cleaningMinutes: null,
    cleaningArea: null,
    runScope: "last",
    suction: "standard",
    consumables: { low: false, lowest: { part: "mop", percent: 82 } },
    faultCode: null,
    updatedAt: "2026-11-03T04:51:46.000Z",
    ...overrides,
  };
}

function renderCard({ data = model(), error, widget = {} } = {}) {
  useWidgetAPI.mockReturnValue({ data: error ? undefined : data, error, mutate });
  const service = { widget: { type: "uovacuum", service_group: "g", service_name: "s", index: 0, ...widget } };
  return renderWithProviders(<Component service={service} />);
}

const button = (name) => screen.getByRole("button", { name });

function sentBody() {
  const [url, options] = global.fetch.mock.calls.at(-1);
  expect(url).toContain("endpoint=action");
  expect(options.method).toBe("POST");
  return JSON.parse(options.body);
}

describe("widgets/uovacuum/component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a charging robot with last run's numbers as unknown", () => {
    renderCard();

    expect(screen.getByText("uovacuum.status.charging")).toBeInTheDocument();
    expect(screen.getByText("uovacuum.detail.charging")).toBeInTheDocument();
    expect(screen.getByText("98")).toBeInTheDocument();
    expect(screen.getByText("uovacuum.lastTime")).toBeInTheDocument();
    expect(screen.getByText("uovacuum.lastArea")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("uovacuum.consumables.ok")).toBeInTheDocument();
  });

  it("labels this run's numbers and locks start while cleaning", () => {
    renderCard({ data: model({ status: "cleaning", runScope: "current", cleaningMinutes: 12, cleaningArea: 18 }) });

    expect(screen.getByText("uovacuum.currentTime")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(button("uovacuum.cleaningNow")).toBeDisabled();
    expect(button("uovacuum.stop")).toBeEnabled();
    expect(button("uovacuum.dock")).toBeEnabled();
    expect(button("uovacuum.dust")).toBeDisabled();
  });

  it("keeps stop available and dock locked while the job washes the mop at the dock", () => {
    renderCard({ data: model({ status: "preparing", runScope: "current" }) });

    expect(button("uovacuum.cleaningNow")).toBeDisabled();
    expect(button("uovacuum.stop")).toBeEnabled();
    expect(button("uovacuum.dock")).toBeDisabled();
  });

  it("offers resume while paused", () => {
    renderCard({ data: model({ status: "paused", runScope: "current" }) });

    expect(button("uovacuum.resume")).toBeEnabled();
    expect(button("uovacuum.stop")).toBeEnabled();
  });

  it("allows station work only while docked", () => {
    renderCard();

    expect(button("uovacuum.stop")).toBeDisabled();
    expect(button("uovacuum.dock")).toBeDisabled();
    expect(button("uovacuum.dust")).toBeEnabled();
    expect(button("uovacuum.wash")).toBeEnabled();
    expect(button("uovacuum.dry uovacuum.dryStart")).toBeEnabled();
    expect(button("uovacuum.dry uovacuum.dryStop")).toBeEnabled();
  });

  it("needs a second press within 3 seconds to start", async () => {
    renderCard();

    fireEvent.click(button("uovacuum.start"));
    expect(button("uovacuum.confirmStart")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(button("uovacuum.confirmStart"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ action: "start" });
  });

  it("forgets the first press after 3 seconds", () => {
    vi.useFakeTimers();
    renderCard();

    fireEvent.click(button("uovacuum.start"));
    act(() => {
      vi.advanceTimersByTime(3001);
    });

    expect(button("uovacuum.start")).toBeInTheDocument();
    fireEvent.click(button("uovacuum.start"));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(button("uovacuum.confirmStart")).toBeInTheDocument();
  });

  it("sends the chosen suction", async () => {
    renderCard();

    expect(button("uovacuum.suctionOptions.standard")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button("uovacuum.suctionOptions.max"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ action: "suction", value: "max" });
  });

  it("confirms a sent command and re-reads the state", async () => {
    renderCard();

    fireEvent.click(button("uovacuum.dust"));

    expect(await screen.findByText("uovacuum.sent.dust")).toBeInTheDocument();
    expect(sentBody()).toEqual({ action: "dust" });
    expect(mutate).toHaveBeenCalled();
  });

  it("says so when the command cannot be sent", async () => {
    global.fetch.mockRejectedValueOnce(new Error("network down"));
    renderCard();

    fireEvent.click(button("uovacuum.locate"));

    expect(await screen.findByText("uovacuum.failed")).toBeInTheDocument();
  });

  it("says so when the command gets no answer within 10 seconds", async () => {
    vi.useFakeTimers();
    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    renderCard();

    fireEvent.click(button("uovacuum.locate"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10001);
    });

    expect(screen.getByText("uovacuum.failed")).toBeInTheDocument();
  });

  it("keeps the chosen suction readable on light themes", () => {
    renderCard();

    const chosen = button("uovacuum.suctionOptions.standard");
    expect(chosen).toHaveClass("text-teal-700", "dark:text-teal-300");
    expect(chosen.style.color).toBe("");
  });

  it("says so when Home Assistant refuses the command", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "home_assistant_rejected" }) });
    renderCard({ data: model({ status: "cleaning", runScope: "current" }) });

    fireEvent.click(button("uovacuum.stop"));

    expect(await screen.findByText("uovacuum.failed")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("goes offline and disables every control when the state cannot be read", () => {
    renderCard({ error: { message: "home_assistant_unavailable" } });

    expect(screen.getByText("uovacuum.status.offline")).toBeInTheDocument();
    for (const control of screen.getAllByRole("button")) {
      expect(control).toBeDisabled();
    }
  });

  it("warns about the most worn part", () => {
    renderCard({ data: model({ consumables: { low: true, lowest: { part: "filter", percent: 8 } } }) });

    expect(screen.getByText("uovacuum.consumables.low")).toBeInTheDocument();
    expect(screen.queryByText("uovacuum.consumables.ok")).not.toBeInTheDocument();
  });

  it("points to the Mi Home app with the fault code", () => {
    renderCard({ data: model({ status: "error", faultCode: "68" }) });

    expect(screen.getByText("uovacuum.status.error")).toBeInTheDocument();
    expect(screen.getByText("uovacuum.detail.error")).toBeInTheDocument();
  });

  it("polls fast while a job runs and slowly otherwise", () => {
    renderCard({ data: model({ status: "cleaning", runScope: "current" }) });
    expect(useWidgetAPI.mock.calls.at(-1)[2]).toEqual({ refreshInterval: 5000 });

    useWidgetAPI.mockClear();
    renderCard({ widget: { refreshInterval: 20000 } });
    expect(useWidgetAPI.mock.calls.at(-1)[2]).toEqual({ refreshInterval: 20000 });

    useWidgetAPI.mockClear();
    renderCard();
    expect(useWidgetAPI.mock.calls.at(-1)[2]).toEqual({ refreshInterval: 15000 });
  });
});
