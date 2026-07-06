export const TAKADA_EMPLOYEE_ID = "70";
export const TAKADA_EMPLOYEE_NAME = "高田 健治";

const VALID_STATUSES = new Set(["working", "off_work", "not_checked_in"]);

export function isTakadaEmployee(employee) {
  return (
    String(employee?.employee || "").trim() === TAKADA_EMPLOYEE_ID ||
    String(employee?.employee_name || "").trim() === TAKADA_EMPLOYEE_NAME
  );
}

export function normalizeTakadaManualStatus(value) {
  if (!value || typeof value !== "object" || !isTakadaEmployee(value)) {
    return null;
  }

  const status = String(value.status || "").trim();
  const date = String(value.date || "").trim();
  const time = value.time ? String(value.time).trim() : null;

  if (!VALID_STATUSES.has(status) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  if (time && !/^\d{1,2}:\d{2}$/.test(time)) {
    return null;
  }

  return {
    employee: TAKADA_EMPLOYEE_ID,
    employee_name: TAKADA_EMPLOYEE_NAME,
    date,
    status,
    time: status === "not_checked_in" ? null : time,
    ...(value.updatedAt ? { updatedAt: String(value.updatedAt) } : {}),
  };
}

export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalTime(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function getNextTakadaManualStatus(currentStatus, now = new Date(), date = formatLocalDate(now)) {
  if (currentStatus === "off_work") {
    return null;
  }

  return {
    employee: TAKADA_EMPLOYEE_ID,
    employee_name: TAKADA_EMPLOYEE_NAME,
    date,
    status: currentStatus === "working" ? "off_work" : "working",
    time: formatLocalTime(now),
  };
}
