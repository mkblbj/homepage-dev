import { AISummaryError } from "./errors.mjs";

function localized(maxJa, maxZh) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ja", "zh"],
    properties: {
      ja: { type: "string", minLength: 1, maxLength: maxJa },
      zh: { type: "string", minLength: 1, maxLength: maxZh },
    },
  };
}

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "assessment", "actions"],
  properties: {
    headline: localized(80, 60),
    assessment: localized(300, 220),
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "module", "shopName", "metricKey", "title", "reason"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          module: { type: "string", enum: ["shipping", "attention", "sales", "performance"] },
          shopName: { type: ["string", "null"] },
          metricKey: { type: ["string", "null"] },
          title: localized(80, 60),
          reason: localized(200, 150),
        },
      },
    },
  },
};

function schemaFailure(message) {
  throw new AISummaryError("model_schema", message);
}

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    schemaFailure(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    schemaFailure(label + " contains unexpected fields");
  }
}

function assertLocalized(value, label, maxJa, maxZh) {
  assertKeys(value, ["ja", "zh"], label);
  if (typeof value.ja !== "string" || value.ja.length < 1 || value.ja.length > maxJa) {
    schemaFailure(label + ".ja is invalid");
  }
  if (typeof value.zh !== "string" || value.zh.length < 1 || value.zh.length > maxZh) {
    schemaFailure(label + ".zh is invalid");
  }
}

export function validateModelSummary(value, { metricKeys }) {
  assertKeys(value, ["headline", "assessment", "actions"], "summary");
  assertLocalized(value.headline, "headline", 80, 60);
  assertLocalized(value.assessment, "assessment", 300, 220);

  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 3) {
    schemaFailure("actions length is invalid");
  }
  value.actions.forEach((action, index) => {
    const label = "actions[" + index + "]";
    assertKeys(action, ["priority", "module", "shopName", "metricKey", "title", "reason"], label);
    if (!["high", "medium", "low"].includes(action.priority)) {
      schemaFailure("action priority is invalid");
    }
    if (!["shipping", "attention", "sales", "performance"].includes(action.module)) {
      schemaFailure("action module is invalid");
    }
    if (action.shopName !== null && typeof action.shopName !== "string") {
      schemaFailure("action shop is invalid");
    }
    if (action.metricKey !== null && (typeof action.metricKey !== "string" || !metricKeys.has(action.metricKey))) {
      schemaFailure("action metric is unknown");
    }
    assertLocalized(action.title, label + ".title", 80, 60);
    assertLocalized(action.reason, label + ".reason", 200, 150);
  });

  return structuredClone(value);
}
