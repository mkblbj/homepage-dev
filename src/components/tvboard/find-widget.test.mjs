import assert from "node:assert/strict";
import test from "node:test";

import { findWidgetByType } from "./find-widget.mjs";

const groups = [
  {
    name: "UO サービス",
    services: [],
    groups: [
      {
        name: "リアルタイム看板",
        services: [
          {
            name: "出荷出力",
            widgets: [{ type: "uoshippingdashboard", service_group: "リアルタイム看板", service_name: "出荷出力", index: 0 }],
          },
        ],
        groups: [],
      },
    ],
  },
  { name: "楽天", services: [{ name: "売上", widgets: [{ type: "uorakutensales", service_name: "売上", index: 0 }] }] },
];

test("finds the first widget of a type, however deep its group sits", () => {
  assert.equal(findWidgetByType(groups, "uoshippingdashboard").service_name, "出荷出力");
  assert.equal(findWidgetByType(groups, "uorakutensales").service_name, "売上");
});

test("a type that is not configured is null", () => {
  assert.equal(findWidgetByType(groups, "uoattention"), null);
  assert.equal(findWidgetByType(undefined, "uoattention"), null);
});
