// @vitest-environment jsdom

import { screen } from "@testing-library/react";
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

function mockApi({ actual, today, tomorrow } = {}) {
  useWidgetAPI.mockImplementation((_widget, endpoint, params) => {
    if (endpoint === "actual") {
      return { data: actual, error: undefined, mutate: vi.fn() };
    }
    if (endpoint === "schedule" && params?.day === "today") {
      return { data: today, error: undefined, mutate: vi.fn() };
    }
    if (endpoint === "schedule" && params?.day === "tomorrow") {
      return { data: tomorrow, error: undefined, mutate: vi.fn() };
    }
    return { data: undefined, error: undefined, mutate: vi.fn() };
  });
}

describe("widgets/uoattendance/component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix "now" to the early afternoon so not-checked-in people read as 未打刻.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T14:30:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the loading skeleton before the actual API resolves", () => {
    mockApi({ actual: undefined });

    const { container } = renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the timeline with per-department working ratios and live states", () => {
    mockApi({
      actual: { message: { employees: actualEmployees } },
      today: { message: { today: todaySnapshot } },
      tomorrow: { message: { tomorrow: tomorrowSnapshot } },
    });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    // header + live signal
    expect(screen.getByText("今日出勤中")).toBeInTheDocument();
    expect(screen.getByText("名出勤中")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();

    // department cards (label also appears in the summary legend, hence getAllByText)
    expect(screen.getAllByText("オフィス").length).toBeGreaterThan(0);
    expect(screen.getAllByText("生産").length).toBeGreaterThan(0);

    // every rostered person shows up
    expect(screen.getByText("温 剛")).toBeInTheDocument();
    expect(screen.getByText("高田 健治")).toBeInTheDocument();
    expect(screen.getByText("周 阔")).toBeInTheDocument();
    expect(screen.getByText("李 玲")).toBeInTheDocument();

    // state-specific right labels
    expect(screen.getByText("08:57")).toBeInTheDocument(); // working → check-in time
    expect(screen.getByText("未打刻")).toBeInTheDocument(); // not_checked_in after start
    expect(screen.getAllByText("退勤済").length).toBeGreaterThan(0); // off_work (row + legend)

    // walk-in surfaced as 予定外 working row
    expect(screen.getByText("予定外 太郎")).toBeInTheDocument();

    // tomorrow panel collapsed line
    expect(screen.getByText("明日予定")).toBeInTheDocument();
    expect(screen.getByText("2 名")).toBeInTheDocument();
  });

  it("shows the empty state when there is a roster but nobody is scheduled", () => {
    mockApi({
      actual: { message: { employees: [] } },
      today: { message: { today: { ...todaySnapshot, count: 0, employees: [], departments: {} } } },
      tomorrow: { message: { tomorrow: tomorrowSnapshot } },
    });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.getByText("本日の予定はありません")).toBeInTheDocument();
  });

  it("renders the error container when the actual API fails", () => {
    useWidgetAPI.mockReturnValue({ data: undefined, error: { message: "boom" }, mutate: vi.fn() });

    renderWithProviders(<Component service={service} />, { settings: { hideErrors: false } });

    expect(screen.getAllByText(/widget\.api_error/i).length).toBeGreaterThan(0);
  });
});
