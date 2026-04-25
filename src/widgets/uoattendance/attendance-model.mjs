export const DEPARTMENT_CATEGORY_ORDER = ["Office", "Production"];

export const DEPARTMENT_CATEGORY_LABELS = {
  Office: "オフィス",
  Production: "生産",
};

export const SHIFT_BADGE_STYLES = {
  "9-12": "border border-cyan-200/80 bg-cyan-100/75 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200",
  "9-16": "border border-sky-200/80 bg-sky-100/75 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  "9-17": "border border-blue-200/80 bg-blue-100/75 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200",
  "9-18": "border border-emerald-200/80 bg-emerald-100/75 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  "10-16": "border border-amber-200/80 bg-amber-100/75 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  "10-17": "border border-orange-200/80 bg-orange-100/75 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200",
  "10-18": "border border-rose-200/80 bg-rose-100/75 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
  "13-18": "border border-fuchsia-200/80 bg-fuchsia-100/75 text-fuchsia-700 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-200",
};

const STATUS_META = {
  working: {
    label: "出勤中",
    tone: "working",
    chipClass:
      "border-emerald-300/80 bg-emerald-100/85 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-100",
    dotClass: "bg-emerald-500 dark:bg-emerald-300",
  },
  off_work: {
    label: "退勤済",
    tone: "off_work",
    chipClass:
      "border-slate-300/80 bg-slate-100/80 text-slate-700 dark:border-slate-500/35 dark:bg-slate-500/15 dark:text-slate-200",
    dotClass: "bg-slate-400 dark:bg-slate-300",
  },
  not_checked_in: {
    label: "未打刻",
    tone: "not_checked_in",
    chipClass:
      "border-dashed border-theme-300/60 bg-theme-100/35 text-theme-500 opacity-75 dark:border-theme-600/35 dark:bg-theme-900/15 dark:text-theme-400",
    dotClass: "bg-theme-300 dark:bg-theme-600",
  },
};

export function formatScheduledShift(employee) {
  if (employee?.shift_label) {
    return employee.shift_label;
  }

  if (employee?.scheduled_time) {
    return employee.scheduled_time;
  }

  if (employee?.start_time && employee?.end_time) {
    return `${employee.start_time}-${employee.end_time}`;
  }

  return "未設定";
}

export function getShiftBadgeClass(shift) {
  return (
    SHIFT_BADGE_STYLES[shift] ||
    "border border-theme-300/70 bg-theme-100/80 text-theme-700 dark:border-theme-600/40 dark:bg-theme-700/30 dark:text-theme-200"
  );
}

export function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.not_checked_in;
}

export function formatCheckinTime(value) {
  if (!value) {
    return null;
  }

  const text = String(value);
  const timePart = text.includes(" ") ? text.split(" ").pop() : text;
  const [hour, minute] = timePart.split(":");
  if (!hour || !minute) {
    return text;
  }
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function getCategoryLabel(category) {
  return DEPARTMENT_CATEGORY_LABELS[category] || category || "未分類";
}

function categorySortKey(category) {
  const index = DEPARTMENT_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? 100 : index;
}

function getShiftSortValue(employee) {
  const shift = formatScheduledShift(employee);
  const match = shift.match(/^(\d{1,2})(?::\d{2})?-/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function sortEmployeesForSchedule(a, b) {
  const shiftCompare = getShiftSortValue(a) - getShiftSortValue(b);
  if (shiftCompare !== 0) {
    return shiftCompare;
  }

  const shiftLabelCompare = formatScheduledShift(a).localeCompare(formatScheduledShift(b), "ja");
  if (shiftLabelCompare !== 0) {
    return shiftLabelCompare;
  }

  return (a.employee_name || "").localeCompare(b.employee_name || "", "ja");
}

function makeScheduledEmployee(employee) {
  const attendanceStatus = employee.attendance_status || "not_checked_in";
  const statusMeta = getStatusMeta(attendanceStatus);
  const shiftText = formatScheduledShift(employee);

  return {
    ...employee,
    attendance_status: attendanceStatus,
    attendance_status_label: employee.attendance_status_label || statusMeta.label,
    last_checkin_time: formatCheckinTime(employee.last_checkin_time),
    shiftText,
    shiftBadgeClass: getShiftBadgeClass(shiftText),
    statusMeta,
  };
}

function makeCurrentWorkingEmployee(employee) {
  return {
    ...employee,
    attendance_status: "working",
    attendance_status_label: "出勤中",
    last_log_type: "IN",
    last_checkin_time: formatCheckinTime(employee.checkin_time || employee.last_checkin_time),
    last_checkin_location: employee.location || employee.last_checkin_location || null,
    shiftText: "未排班",
    shiftBadgeClass:
      "border border-amber-200/80 bg-amber-100/75 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
    statusMeta: getStatusMeta("working"),
  };
}

function getEmployeesByCategory(snapshot) {
  const employeesByCategory = {};

  (snapshot?.employees || []).forEach((employee) => {
    const category = employee.department_category || "Other";
    if (!employeesByCategory[category]) {
      employeesByCategory[category] = [];
    }
    employeesByCategory[category].push(employee);
  });

  return employeesByCategory;
}

function getOrderedCategories(snapshot, employeesByCategory) {
  const categories = new Set(Object.keys(employeesByCategory));
  Object.keys(snapshot?.departments || {}).forEach((category) => categories.add(category));

  return [...categories].sort((a, b) => {
    const categoryCompare = categorySortKey(a) - categorySortKey(b);
    if (categoryCompare !== 0) {
      return categoryCompare;
    }
    return a.localeCompare(b, "ja");
  });
}

export function buildTomorrowScheduleModel(snapshot) {
  const employeesByCategory = getEmployeesByCategory(snapshot);
  const groups = getOrderedCategories(snapshot, employeesByCategory).map((category) => {
    const employees = (employeesByCategory[category] || [])
      .map((employee) => ({
        ...employee,
        shiftText: formatScheduledShift(employee),
        shiftBadgeClass: getShiftBadgeClass(formatScheduledShift(employee)),
      }))
      .sort(sortEmployeesForSchedule);

    return {
      key: category,
      label: getCategoryLabel(category),
      count: snapshot?.departments?.[category]?.count ?? employees.length,
      employees,
    };
  });

  return {
    date: snapshot?.date || null,
    count: snapshot?.count ?? 0,
    groups,
  };
}

function buildScheduledTodayGroups(todaySnapshot) {
  const employeesByCategory = getEmployeesByCategory(todaySnapshot);
  return getOrderedCategories(todaySnapshot, employeesByCategory)
    .map((category) => {
      const employees = (employeesByCategory[category] || [])
        .map(makeScheduledEmployee)
        .sort(sortEmployeesForSchedule);

      return {
        key: category,
        label: getCategoryLabel(category),
        count: todaySnapshot?.departments?.[category]?.count ?? employees.length,
        employees,
      };
    })
    .filter((group) => group.count > 0 || group.employees.length > 0);
}

function buildCurrentWorkingFallbackGroup(actualEmployees) {
  const employees = (actualEmployees || [])
    .map(makeCurrentWorkingEmployee)
    .sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || "", "ja"));

  return employees.length
    ? [
        {
          key: "current-working",
          label: "出勤中",
          count: employees.length,
          employees,
        },
      ]
    : [];
}

function buildUnscheduledWorkingGroup(todaySnapshot, actualEmployees) {
  const scheduledEmployeeIds = new Set((todaySnapshot?.employees || []).map((employee) => employee.employee));
  const unscheduledEmployees = (actualEmployees || []).filter(
    (employee) => employee.employee && !scheduledEmployeeIds.has(employee.employee),
  );

  if (unscheduledEmployees.length === 0) {
    return null;
  }

  return {
    key: "unscheduled-working",
    label: "未排班出勤",
    count: unscheduledEmployees.length,
    employees: unscheduledEmployees
      .map(makeCurrentWorkingEmployee)
      .sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || "", "ja")),
  };
}

function countEmployeesByStatus(employees, status) {
  return employees.filter((employee) => employee.attendance_status === status).length;
}

export function buildTodayAttendanceModel({ todaySnapshot, actualEmployees = [] }) {
  const hasRoster = Boolean(todaySnapshot?.attendance_status_basis && Array.isArray(todaySnapshot?.employees));

  if (!hasRoster) {
    return {
      hasRoster: false,
      date: todaySnapshot?.date || null,
      summary: {
        scheduledCount: 0,
        workingCount: actualEmployees.length,
        offWorkCount: 0,
        notCheckedInCount: 0,
        unscheduledWorkingCount: 0,
      },
      groups: buildCurrentWorkingFallbackGroup(actualEmployees),
    };
  }

  const scheduledEmployees = (todaySnapshot.employees || []).map(makeScheduledEmployee);
  const groups = buildScheduledTodayGroups({
    ...todaySnapshot,
    employees: scheduledEmployees,
  });
  const unscheduledWorkingGroup = buildUnscheduledWorkingGroup(todaySnapshot, actualEmployees);

  if (unscheduledWorkingGroup) {
    groups.push(unscheduledWorkingGroup);
  }

  return {
    hasRoster: true,
    date: todaySnapshot.date || null,
    summary: {
      scheduledCount: todaySnapshot.count ?? scheduledEmployees.length,
      workingCount: countEmployeesByStatus(scheduledEmployees, "working"),
      offWorkCount: countEmployeesByStatus(scheduledEmployees, "off_work"),
      notCheckedInCount: countEmployeesByStatus(scheduledEmployees, "not_checked_in"),
      unscheduledWorkingCount: unscheduledWorkingGroup?.count || 0,
    },
    groups,
  };
}
