/*
 * uoroster カレンダー — 配置解析とパラメータ検証
 *
 * ここは純粋関数のみ。設定の読み込みと HTTP は API ルート側の責務で、
 * このモジュールは「受け付けるか」「どう組み立てるか」だけを決める。
 */

const CALENDAR_PATH = "/api/method/work_roster.api.published_calendar.get_current_month_calendar";

// department は HR へのクエリ文字列にそのまま載る。サニタイズではなく
// ホワイトリストで弾き、呼び出し側から上流へ細工を注入できないようにする。
const ALLOWED_DEPARTMENTS = ["Production", "Office"];

export function normalizeDepartment(value) {
  return ALLOWED_DEPARTMENTS.includes(value) ? value : null;
}

export function buildCalendarUrl(baseUrl, department) {
  const trimmed = String(baseUrl).replace(/\/+$/, "");
  return `${trimmed}${CALENDAR_PATH}?department_category=${encodeURIComponent(department)}`;
}

export function findRosterCalendarConfig(groups) {
  for (const group of groups ?? []) {
    for (const service of group?.services ?? []) {
      const widgets = service?.widgets ?? (service?.widget ? [service.widget] : []);
      for (const widget of widgets) {
        const { type, rosterCalendarUrl: baseUrl, rosterCalendarToken: token } = widget ?? {};
        if (type === "uoattendance" && baseUrl && token) {
          return { baseUrl, token };
        }
      }
    }

    // services.yaml はグループを入れ子にする。目的の widget は必ず末端にいるので、
    // ここを降りないと設定は永遠に見つからない。
    const nested = findRosterCalendarConfig(group?.groups);
    if (nested) {
      return nested;
    }
  }

  return null;
}
