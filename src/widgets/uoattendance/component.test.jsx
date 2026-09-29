// @vitest-environment jsdom

import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));

vi.mock("utils/proxy/use-widget-api", () => ({
  default: useWidgetAPI,
}));

import Component from "./component";

// Realistic "today" roster: the backend merges live check-in status into the
// published schedule, so each employee already carries attendance_status.
const todaySnapshot = {
  date: "2026-07-06",
  count: 4,
  attendance_status_basis: "employee_checkin_last_log",
  employees: [
    {
      employee: "44",
      employee_name: "温 剛",
      department_category: "Office",
      shift_label: "9-18",
      scheduled_time: "09:00-18:00",
      start_time: "09:00",
      end_time: "18:00",
      attendance_status: "working",
      attendance_status_label: "出勤中",
      last_log_type: "IN",
      last_checkin_time: "08:57",
    },
    {
      employee: "70",
      employee_name: "高田 健治",
      department_category: "Office",
      shift_label: "9-18",
      scheduled_time: "09:00-18:00",
      start_time: "09:00",
      end_time: "18:00",
      attendance_status: "not_checked_in",
      attendance_status_label: "未打刻",
      last_log_type: null,
      last_checkin_time: null,
    },
    {
      employee: "83",
      employee_name: "周 阔",
      department_category: "Production",
      shift_label: "9-17",
      scheduled_time: "09:00-17:00",
      start_time: "09:00",
      end_time: "17:00",
      attendance_status: "off_work",
      attendance_status_label: "退勤済",
      last_log_type: "OUT",
      last_checkin_time: "17:02",
    },
    {
      employee: "51",
      employee_name: "李 玲",
      department_category: "Production",
      shift_label: "9-18",
      scheduled_time: "09:00-18:00",
      start_time: "09:00",
      end_time: "18:00",
      attendance_status: "working",
      attendance_status_label: "出勤中",
      last_log_type: "IN",
      last_checkin_time: "08:51",
    },
  ],
  departments: {
    Office: { count: 2, employees: [] },
    Production: { count: 2, employees: [] },
  },
};

// "at work" API only lists people currently checked in.
const actualEmployees = [
  {
    employee: "44",
    employee_name: "温 剛",
    department: "オフィス - UO",
    checkin_time: "08:57:16",
    attendance_status: "working",
    attendance_status_label: "出勤中",
    last_log_type: "IN",
    last_checkin_time: "08:57",
  },
  {
    employee: "51",
    employee_name: "李 玲",
    department: "生産 - UO",
    checkin_time: "08:51:40",
    attendance_status: "working",
    attendance_status_label: "出勤中",
    last_log_type: "IN",
    last_checkin_time: "08:51",
  },
  // walk-in: present in the office but not on today's roster
  {
    employee: "999",
    employee_name: "予定外 太郎",
    department: "オフィス - UO",
    checkin_time: "10:15:00",
    attendance_status: "working",
    attendance_status_label: "出勤中",
    last_log_type: "IN",
    last_checkin_time: "10:15",
  },
];

const tomorrowSnapshot = {
  date: "2026-07-07",
  count: 2,
  employees: [
    { employee: "67", employee_name: "倖田 柚子", department_category: "Office", shift_label: "9-18" },
    { employee: "83", employee_name: "周 阔", department_category: "Production", shift_label: "9-17" },
  ],
  departments: {
    Office: { count: 1, employees: [] },
    Production: { count: 1, employees: [] },
  },
};

const service = {
  widget: { type: "uoattendance", scheduleUrl: "http://example/schedule", refreshInterval: 3600000 },
};

const serviceWithCalendar = {
  widget: { ...service.widget, rosterCalendar: true },
};

const liveData = {
  actual: { message: { employees: actualEmployees } },
  today: { message: { today: todaySnapshot } },
  tomorrow: { message: { tomorrow: tomorrowSnapshot } },
};

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function mockApi({ actual, today, tomorrow, todayError, tomorrowError } = {}) {
  const mutate = { actual: vi.fn(), today: vi.fn(), tomorrow: vi.fn() };
  useWidgetAPI.mockImplementation((_widget, endpoint, params) => {
    if (endpoint === "actual") {
      return { data: actual, error: undefined, mutate: mutate.actual };
    }
    if (endpoint === "schedule" && params?.day === "today") {
      return { data: today, error: todayError, mutate: mutate.today };
    }
    if (endpoint === "schedule" && params?.day === "tomorrow") {
      return { data: tomorrow, error: tomorrowError, mutate: mutate.tomorrow };
    }
    return { data: undefined, error: undefined, mutate: vi.fn() };
  });
  return mutate;
}

// Tooltips separate their parts with ideographic spaces (　); the default
// normalizer would collapse those, so match titles exactly as rendered.
function getTile(title) {
  return screen.getByTitle(title, { normalizer: (text) => text });
}

// The ring is the first child of each person's tile; its box size tells the two ring sizes apart.
function ringOf(name) {
  return screen.getByText(name).parentElement.firstElementChild;
}

function officeEmployee(index) {
  return {
    employee: `O${index}`,
    employee_name: `社員 ${index}`,
    department_category: "Office",
    shift_label: "9-18",
    start_time: "09:00",
    end_time: "18:00",
    attendance_status: "working",
    last_log_type: "IN",
    last_checkin_time: "08:50",
  };
}

describe("widgets/uoattendance/component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix "now" to the early afternoon so not-checked-in people read as late.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T14:30:00"));
    global.fetch = vi.fn(async (_url, options = {}) => {
      if (options.method === "PUT") {
        return {
          ok: true,
          json: async () => ({ status: JSON.parse(options.body) }),
        };
      }
      if (options.method === "DELETE") {
        return {
          ok: true,
          json: async () => ({ status: null }),
        };
      }
      return {
        ok: true,
        json: async () => ({ status: null }),
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.fetch;
  });

  it("renders the loading skeleton before the actual API resolves", () => {
    mockApi({ actual: undefined });

    const { container } = renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the header, the summary rings and a ring for every person", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    // header: title, date, live clock, LIVE, refresh
    expect(screen.getByText("今日出勤中")).toBeInTheDocument();
    expect(screen.getByText("7/6 (月)")).toBeInTheDocument();
    expect(screen.getByText("14:30")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();

    // summary: present / total in the middle, one legend row per ring
    const summary = screen.getByRole("group", { name: "今日の概要" });
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("/5")).toBeInTheDocument();
    expect(within(summary).getByText("2/3")).toBeInTheDocument(); // オフィス incl. the walk-in
    expect(within(summary).getByText("1/2")).toBeInTheDocument(); // 生産
    expect(within(summary).getByText("換算 1.9")).toBeInTheDocument(); // 7h + 8h over an 8h day
    expect(within(summary).getByText("今日の経過")).toBeInTheDocument();
    expect(within(summary).getByText("61%")).toBeInTheDocument(); // 9:00–18:00 at 14:30

    // department panels
    const office = screen.getByRole("group", { name: "オフィス" });
    const production = screen.getByRole("group", { name: "生産" });
    expect(within(office).getByText("温 剛")).toBeInTheDocument();
    expect(within(office).getByText("高田 健治")).toBeInTheDocument();
    expect(within(office).getByText("予定外 太郎")).toBeInTheDocument();
    expect(within(production).getByText("周 阔")).toBeInTheDocument();
    expect(within(production).getByText("李 玲")).toBeInTheDocument();

    // under each ring: the scheduled end, 退勤済 once gone, the shift text for walk-ins
    expect(within(office).getAllByText("18:00")).toHaveLength(2);
    expect(within(office).getByText("予定外")).toBeInTheDocument();
    expect(within(production).getByText("退勤済")).toBeInTheDocument();
    expect(within(production).getByText("退勤済 1名")).toBeInTheDocument();
    expect(within(production).queryByText("17:00")).not.toBeInTheDocument();
  });

  it("keeps progress, remaining time and punch times in each person's hover title", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(getTile("温 剛　09:00–18:00　61%　あと 3:30　出勤 08:57")).toBeInTheDocument();
    expect(getTile("高田 健治　09:00–18:00　5時間30分遅れ")).toBeInTheDocument();
    expect(getTile("周 阔　09:00–17:00　退勤済 17:02")).toBeInTheDocument();
    expect(getTile("予定外 太郎　予定外　出勤 10:15")).toBeInTheDocument();
  });

  it("keeps each ring's centre for the photo, adding only a check once someone has left", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    // working, late, walk-in: nothing but the drawn ring itself
    ["温 剛", "高田 健治", "予定外 太郎", "李 玲"].forEach((name) => {
      const ring = ringOf(name);
      expect(ring).toHaveTextContent("");
      expect(ring.querySelector("svg")).toBeNull();
      [...ring.children].forEach((layer) => expect(layer).toHaveAttribute("aria-hidden", "true"));
    });

    // off work: a check in the middle, still no text
    const done = ringOf("周 阔");
    expect(done).toHaveTextContent("");
    expect(done.querySelector("svg path")).toHaveAttribute("d", "M5 12.5l4.5 4.5L19 7.5");
    [...done.children].forEach((layer) => expect(layer).toHaveAttribute("aria-hidden", "true"));

    // the percentage is still read out
    expect(
      within(ringOf("温 剛").parentElement).getByText("61%　あと 3:30", { normalizer: (text) => text }),
    ).toHaveClass("sr-only");
  });

  it("sinks the photo under a check once someone has left and fades it before they are due", () => {
    const photo = (employee) => ({ ...employee, image: `/files/${employee.employee}.png` });
    const roster = {
      ...todaySnapshot,
      count: 5,
      employees: [
        ...todaySnapshot.employees.map(photo),
        // due at 15:00, so not in yet at 14:30
        photo({
          employee: "88",
          employee_name: "山本 健",
          department_category: "Production",
          shift_label: "15-22",
          start_time: "15:00",
          end_time: "22:00",
          attendance_status: "not_checked_in",
        }),
      ],
      departments: { Office: { count: 2, employees: [] }, Production: { count: 3, employees: [] } },
    };
    mockApi({ ...liveData, today: { message: { today: roster } } });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const gone = ringOf("周 阔");
    expect(gone.querySelector("img").style.filter).toBe("grayscale(0.6) brightness(0.45)");
    expect(gone.querySelector("svg").parentElement).toHaveClass("text-white/90");

    const upcoming = ringOf("山本 健").querySelector("img");
    expect(upcoming.style.opacity).toBe("0.6");
    expect(upcoming.style.filter).toBe("");
    expect(ringOf("山本 健").querySelector("svg")).toBeNull();

    // working and late people keep their photo as it is
    ["温 剛", "高田 健治"].forEach((name) => {
      const img = ringOf(name).querySelector("img");
      expect(img.style.filter).toBe("");
      expect(img.style.opacity).toBe("");
    });
  });

  it("keeps the check readable on an empty centre when someone who left has no photo", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const check = ringOf("周 阔").querySelector("svg").parentElement;
    expect(check).toHaveClass("text-neutral-600", "dark:text-white/70");
    expect(check).not.toHaveClass("text-white/90");
  });

  it("shows photos from both attendance APIs in the person's ring", () => {
    const roster = {
      ...todaySnapshot,
      employees: todaySnapshot.employees.map((employee) =>
        employee.employee === "44" ? { ...employee, image: "/files/roster-photo.png" } : employee,
      ),
    };
    const checkins = actualEmployees.map((employee) =>
      employee.employee === "999" ? { ...employee, image: "/files/walk-in-photo.png" } : employee,
    );
    mockApi({
      ...liveData,
      actual: { message: { employees: checkins } },
      today: { message: { today: roster } },
    });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(ringOf("温 剛").querySelector("img")).toHaveAttribute("src", "http://example/files/roster-photo.png");
    expect(ringOf("予定外 太郎").querySelector("img")).toHaveAttribute("src", "http://example/files/walk-in-photo.png");
    expect(ringOf("高田 健治").querySelector("img")).toBeNull();
  });

  it("uses the live check-in photo when the matching roster row has none", () => {
    const checkins = actualEmployees.map((employee) =>
      employee.employee === "44" ? { ...employee, image: "/files/live-photo.png" } : employee,
    );
    mockApi({ ...liveData, actual: { message: { employees: checkins } } });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(ringOf("温 剛").querySelector("img")).toHaveAttribute("src", "http://example/files/live-photo.png");
  });

  it("shows live check-in photos when the schedule API is not configured", () => {
    const checkins = actualEmployees.map((employee) =>
      employee.employee === "44" ? { ...employee, image: "/files/live-photo.png" } : employee,
    );
    mockApi({ actual: { message: { employees: checkins } } });
    const actualOnlyService = {
      widget: { type: "uoattendance", photoBaseUrl: "https://hr.example.com", refreshInterval: 3600000 },
    };

    renderWithProviders(<Component service={actualOnlyService} />, { settings: { hideErrors: false } });

    expect(ringOf("温 剛").querySelector("img")).toHaveAttribute("src", "https://hr.example.com/files/live-photo.png");
  });

  it("does not load a photo URL outside HRMS files", () => {
    const roster = {
      ...todaySnapshot,
      employees: todaySnapshot.employees.map((employee) => {
        if (employee.employee === "44") return { ...employee, image: "//tracker.example/photo.png" };
        if (employee.employee === "70") return { ...employee, image: "https://tracker.example/photo.png" };
        return employee;
      }),
    };
    mockApi({ ...liveData, today: { message: { today: roster } } });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(ringOf("温 剛").querySelector("img")).toBeNull();
    expect(ringOf("高田 健治").querySelector("img")).toBeNull();
  });

  it("keeps the off-work check readable when its photo fails to load", () => {
    const roster = {
      ...todaySnapshot,
      employees: todaySnapshot.employees.map((employee) =>
        employee.employee === "83" ? { ...employee, image: "/files/missing.png" } : employee,
      ),
    };
    mockApi({ ...liveData, today: { message: { today: roster } } });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const ring = ringOf("周 阔");
    fireEvent.error(ring.querySelector("img"));
    expect(ring.querySelector("img")).toBeNull();
    expect(ring.querySelector("svg").parentElement).toHaveClass("text-neutral-600");
  });

  it("uses the large ring while every department has seven or fewer people", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(ringOf("温 剛").style.width).toBe("70px");
    expect(ringOf("李 玲").style.width).toBe("70px");
  });

  it("switches every department to the small ring once one has more than seven people", () => {
    const crowded = {
      ...todaySnapshot,
      count: 10,
      employees: [...todaySnapshot.employees, ...Array.from({ length: 6 }, (_, index) => officeEmployee(index + 1))],
      departments: { Office: { count: 8, employees: [] }, Production: { count: 2, employees: [] } },
    };
    mockApi({ ...liveData, today: { message: { today: crowded } } });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(ringOf("社員 1").style.width).toBe("54px");
    expect(ringOf("李 玲").style.width).toBe("54px");
  });

  it("sets the departments side by side in two rows of large rings once the widget is wide", () => {
    // jsdom has no layout: report a wide grid so the measured-width path runs.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 900, height: 400, top: 0, left: 0, right: 900, bottom: 400, x: 0, y: 0 });
    try {
      mockApi(liveData);

      renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

      const office = screen.getByRole("group", { name: "オフィス" });
      const production = screen.getByRole("group", { name: "生産" });
      expect(office.parentElement).toHaveClass("flex-row");
      expect(office.parentElement).toBe(production.parentElement);

      // 3 office people fold into 2 columns, 2 production people into 1
      expect(office.lastElementChild.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
      expect(production.lastElementChild.style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
      expect(ringOf("温 剛").style.width).toBe("88px");
      expect(ringOf("周 阔").style.width).toBe("88px");
    } finally {
      rect.mockRestore();
    }
  });

  it("keeps the departments stacked while the widget is narrow", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const office = screen.getByRole("group", { name: "オフィス" });
    expect(office.parentElement).toHaveClass("flex-col");
    expect(office.lastElementChild.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(76px, 1fr))");
  });

  it("keeps department text on the contrast-checked ink for each theme", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const office = screen.getByRole("group", { name: "オフィス" });
    const production = screen.getByRole("group", { name: "生産" });

    expect(office.style.getPropertyValue("--ink-l")).toBe("#1A6591");
    expect(office.style.getPropertyValue("--ink-d")).toBe("#8FE0FF");
    expect(production.style.getPropertyValue("--ink-l")).toBe("#8F5A0B");
    expect(production.style.getPropertyValue("--ink-d")).toBe("#FFC56E");
    expect(office).toHaveClass("[--ink:var(--ink-l)]", "dark:[--ink:var(--ink-d)]");
    expect(within(office).getByText("2/3")).toHaveClass("text-[color:var(--ink)]");
  });

  it("summarises tomorrow with who joins and who drops out", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const tomorrow = screen.getByRole("region", { name: "明日の予定" });
    expect(within(tomorrow).getByText("明日 7/7 (火)")).toBeInTheDocument();
    expect(within(tomorrow).getByText("2")).toBeInTheDocument();
    expect(within(tomorrow).getByText("オフィス 1 · 生産 1 · 換算 0.9人")).toBeInTheDocument();
    expect(within(tomorrow).getByText("+1")).toBeInTheDocument();
    expect(within(tomorrow).getByText("倖田 柚子")).toBeInTheDocument();
    expect(within(tomorrow).getByText("−3")).toBeInTheDocument();
    expect(within(tomorrow).getByText("温 剛 ほか2名")).toBeInTheDocument();
  });

  it("shows everyone tomorrow as added when today's valid roster is empty", () => {
    const emptyToday = {
      ...todaySnapshot,
      count: 0,
      employees: [],
      departments: {
        Office: { count: 0, employees: [] },
        Production: { count: 0, employees: [] },
      },
    };
    mockApi({ ...liveData, today: { message: { today: emptyToday } } });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const tomorrow = screen.getByRole("region", { name: "明日の予定" });
    expect(within(tomorrow).getByText("+2")).toBeInTheDocument();
    expect(within(tomorrow).getByText("倖田 柚子")).toBeInTheDocument();
    expect(within(tomorrow).getByText("周 阔")).toBeInTheDocument();
  });

  it("expands tomorrow's per-shift detail on demand", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const tomorrow = screen.getByRole("region", { name: "明日の予定" });
    expect(within(tomorrow).queryByText("9-17")).not.toBeInTheDocument();

    fireEvent.click(within(tomorrow).getByRole("button", { name: "詳細" }));

    expect(within(tomorrow).getByText("9-17")).toBeInTheDocument();
    expect(within(tomorrow).getByText("9-18")).toBeInTheDocument();
    expect(within(tomorrow).getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");
  });

  it("says so when either schedule cannot be loaded", () => {
    mockApi({
      ...liveData,
      today: undefined,
      todayError: { message: "down" },
      tomorrow: undefined,
      tomorrowError: { message: "down" },
    });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.getByText("今日予定を取得できませんでした。現在出勤中のみ表示しています。")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "明日の予定" })).getByText("取得できませんでした"),
    ).toBeInTheDocument();
    // without a roster, everyone checked in is still shown
    expect(screen.getByRole("group", { name: "出勤中" })).toBeInTheDocument();
    expect(getTile("温 剛　予定外　出勤 08:57")).toBeInTheDocument();
  });

  it("refreshes every source and spins the refresh icon", () => {
    const mutate = mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    const refresh = screen.getByRole("button", { name: "更新" });
    fireEvent.click(refresh);

    expect(mutate.actual).toHaveBeenCalledTimes(1);
    expect(mutate.today).toHaveBeenCalledTimes(1);
    expect(mutate.tomorrow).toHaveBeenCalledTimes(1);
    expect(refresh.querySelector("svg").style.transform).toBe("rotate(360deg)");
  });

  it("moves the clock on at the next minute boundary", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });
    expect(screen.getByText("14:30")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_100);
    });

    expect(screen.getByText("14:31")).toBeInTheDocument();
  });

  it("cycles only Takada's display attendance by clicking his name", async () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });
    await act(async () => {
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/uoattendance/takada");
    global.fetch.mockClear();

    fireEvent.click(screen.getByText("温 剛"));
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "高田 健治の表示打刻を切り替え" }));
      await flushPromises();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe("/api/uoattendance/takada");
    expect(global.fetch.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      employee: "70",
      employee_name: "高田 健治",
      date: "2026-07-06",
      status: "working",
      time: "14:30",
    });
    expect(getTile("高田 健治　09:00–18:00　61%　あと 3:30　出勤 14:30")).toBeInTheDocument();

    global.fetch.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByText("高田 健治"));
      await flushPromises();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      status: "off_work",
      time: "14:30",
    });
    expect(getTile("高田 健治　09:00–18:00　退勤済 14:30")).toBeInTheDocument();

    global.fetch.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByText("高田 健治"));
      await flushPromises();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/uoattendance/takada",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows the empty state when there is a roster but nobody is scheduled", () => {
    mockApi({
      actual: { message: { employees: [] } },
      today: { message: { today: { ...todaySnapshot, count: 0, employees: [], departments: {} } } },
      tomorrow: { message: { tomorrow: tomorrowSnapshot } },
    });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.getByText("本日の予定はありません")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "今日の概要" })).not.toBeInTheDocument();
  });

  it("keeps both roster calendars reachable from the empty state", () => {
    mockApi({
      actual: { message: { employees: [] } },
      today: { message: { today: { ...todaySnapshot, count: 0, employees: [], departments: {} } } },
      tomorrow: { message: { tomorrow: tomorrowSnapshot } },
    });

    renderWithProviders(<Component service={serviceWithCalendar} />, { settings: { hideErrors: false } });

    expect(screen.getByRole("link", { name: "生産シフトカレンダー（今月）" })).toHaveAttribute(
      "href",
      "/api/uoroster/calendar?department=Production",
    );
    expect(screen.getByRole("link", { name: "オフィスシフトカレンダー（今月）" })).toHaveAttribute(
      "href",
      "/api/uoroster/calendar?department=Office",
    );
  });

  it("renders the error container when the actual API fails", () => {
    useWidgetAPI.mockReturnValue({ data: undefined, error: { message: "boom" }, mutate: vi.fn() });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.getAllByText(/widget\.api_error/i).length).toBeGreaterThan(0);
  });

  it("puts each roster calendar link in its own department's panel", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={serviceWithCalendar} />, { settings: { hideErrors: false } });

    const production = within(screen.getByRole("group", { name: "生産" })).getByRole("link", {
      name: "生産シフトカレンダー（今月）",
    });
    const office = within(screen.getByRole("group", { name: "オフィス" })).getByRole("link", {
      name: "オフィスシフトカレンダー（今月）",
    });

    expect(production).toHaveAttribute("href", "/api/uoroster/calendar?department=Production");
    expect(office).toHaveAttribute("href", "/api/uoroster/calendar?department=Office");
    expect(production).toHaveAttribute("target", "_blank");
    expect(production).toHaveAttribute("rel", "noopener noreferrer");
    expect(production).toHaveTextContent("シフト表");
    // the icon follows the link's text color
    expect(production.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
  });

  it("hides the roster calendar links when the calendar is not configured", () => {
    mockApi(liveData);

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.queryByRole("link", { name: "生産シフトカレンダー（今月）" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "オフィスシフトカレンダー（今月）" })).not.toBeInTheDocument();
  });
});
