import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarUrl, findRosterCalendarConfig, normalizeDepartment } from "./roster-calendar.mjs";

test("normalizeDepartment accepts only the two published departments", () => {
  assert.equal(normalizeDepartment("Production"), "Production");
  assert.equal(normalizeDepartment("Office"), "Office");

  // department is interpolated into the HR query string, so anything outside
  // the whitelist is rejected rather than sanitized.
  assert.equal(normalizeDepartment("production"), null);
  assert.equal(normalizeDepartment("OFFICE"), null);
  assert.equal(normalizeDepartment("Production&foo=1"), null);
  assert.equal(normalizeDepartment("../../etc/passwd"), null);
  assert.equal(normalizeDepartment(""), null);
  assert.equal(normalizeDepartment(undefined), null);
  assert.equal(normalizeDepartment(null), null);
});

test("buildCalendarUrl joins the HR endpoint regardless of trailing slashes", () => {
  const expected =
    "https://hr.example.com/api/method/work_roster.api.published_calendar.get_current_month_calendar" +
    "?department_category=Production";

  assert.equal(buildCalendarUrl("https://hr.example.com", "Production"), expected);
  assert.equal(buildCalendarUrl("https://hr.example.com/", "Production"), expected);
  assert.equal(buildCalendarUrl("https://hr.example.com///", "Production"), expected);
});

test("findRosterCalendarConfig digs through nested service groups", () => {
  // services.yaml nests groups several levels deep; the widget we want sits at
  // the bottom of that tree, never in the top-level services array.
  const groups = [
    {
      name: "UO サービス",
      services: [],
      groups: [
        {
          name: "ダッシュボード",
          services: [],
          groups: [
            {
              name: "ダッシュボードその他",
              services: [
                {
                  name: "今日出勤中",
                  widget: {
                    type: "uoattendance",
                    rosterCalendarUrl: "https://hr.example.com",
                    rosterCalendarToken: "KEY:SECRET",
                  },
                },
              ],
              groups: [],
            },
          ],
        },
      ],
    },
  ];

  assert.deepEqual(findRosterCalendarConfig(groups), {
    baseUrl: "https://hr.example.com",
    token: "KEY:SECRET",
  });
});

test("findRosterCalendarConfig also reads the widgets[] form", () => {
  const groups = [
    {
      name: "Core",
      services: [
        {
          name: "Attendance",
          widgets: [
            { type: "uorakutensales" },
            {
              type: "uoattendance",
              rosterCalendarUrl: "https://hr.example.com",
              rosterCalendarToken: "KEY:SECRET",
            },
          ],
        },
      ],
      groups: [],
    },
  ];

  assert.deepEqual(findRosterCalendarConfig(groups), {
    baseUrl: "https://hr.example.com",
    token: "KEY:SECRET",
  });
});

test("findRosterCalendarConfig returns null when the calendar is not configured", () => {
  const withoutToken = [
    {
      name: "Core",
      services: [{ name: "A", widget: { type: "uoattendance", rosterCalendarUrl: "https://hr.example.com" } }],
      groups: [],
    },
  ];
  const withoutUrl = [
    {
      name: "Core",
      services: [{ name: "A", widget: { type: "uoattendance", rosterCalendarToken: "KEY:SECRET" } }],
      groups: [],
    },
  ];
  const otherWidget = [
    {
      name: "Core",
      services: [{ name: "A", widget: { type: "uorakutensales", rosterCalendarUrl: "x", rosterCalendarToken: "y" } }],
      groups: [],
    },
  ];

  assert.equal(findRosterCalendarConfig(withoutToken), null);
  assert.equal(findRosterCalendarConfig(withoutUrl), null);
  assert.equal(findRosterCalendarConfig(otherWidget), null);
  assert.equal(findRosterCalendarConfig([]), null);
  assert.equal(findRosterCalendarConfig(undefined), null);
});
