import { AISummaryError } from "./errors.mjs";

const localized = {
  type: "object",
  additionalProperties: false,
  required: ["ja", "zh"],
  properties: {
    ja: { type: "string", minLength: 1, maxLength: 400 },
    zh: { type: "string", minLength: 1, maxLength: 300 },
  },
};

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "assessment", "evidence", "actions", "reviewThemes"],
  properties: {
    headline: localized,
    assessment: localized,
    evidence: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metricKey", "interpretation"],
        properties: {
          metricKey: { type: "string" },
          interpretation: localized,
        },
      },
    },
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "module", "shopName", "title", "reason"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          module: {
            type: "string",
            enum: ["shipping", "attention", "sales", "performance"],
          },
          shopName: { type: ["string", "null"] },
          title: localized,
          reason: localized,
        },
      },
    },
    reviewThemes: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme", "impact", "suggestion"],
        properties: {
          theme: localized,
          impact: localized,
          suggestion: localized,
        },
      },
    },
  },
};

const BUSINESS_NUMBER = /[0-9０-９]/u;

function schemaFailure(message) {
  throw new AISummaryError("model_schema", message, { retryable: true });
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

function assertNoBusinessNumbers(localizedValue) {
  for (const text of [localizedValue.ja, localizedValue.zh]) {
    if (BUSINESS_NUMBER.test(text)) {
      throw new AISummaryError("model_schema", "Business number found in model prose", {
        retryable: true,
      });
    }
  }
}

function assertLocalized(value, label, maxJa = 400, maxZh = 300) {
  assertKeys(value, ["ja", "zh"], label);
  if (typeof value.ja !== "string" || value.ja.length < 1 || value.ja.length > maxJa) {
    schemaFailure(label + ".ja is invalid");
  }
  if (typeof value.zh !== "string" || value.zh.length < 1 || value.zh.length > maxZh) {
    schemaFailure(label + ".zh is invalid");
  }
  assertNoBusinessNumbers(value);
}

export function validateModelSummary(value, { metricKeys, shopNames }) {
  assertKeys(
    value,
    ["headline", "assessment", "evidence", "actions", "reviewThemes"],
    "summary",
  );
  assertLocalized(value.headline, "headline");
  assertLocalized(value.assessment, "assessment");

  if (!Array.isArray(value.evidence) || value.evidence.length < 2 || value.evidence.length > 4) {
    schemaFailure("evidence length is invalid");
  }
  const seenMetrics = new Set();
  value.evidence.forEach((entry, index) => {
    assertKeys(entry, ["metricKey", "interpretation"], "evidence[" + index + "]");
    if (typeof entry.metricKey !== "string" || !metricKeys.has(entry.metricKey)) {
      schemaFailure("evidence metric is unknown");
    }
    if (seenMetrics.has(entry.metricKey)) {
      schemaFailure("evidence metric is duplicated");
    }
    seenMetrics.add(entry.metricKey);
    assertLocalized(entry.interpretation, "evidence[" + index + "].interpretation");
  });

  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 3) {
    schemaFailure("actions length is invalid");
  }
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  let previousPriority = -1;
  value.actions.forEach((action, index) => {
    assertKeys(
      action,
      ["priority", "module", "shopName", "title", "reason"],
      "actions[" + index + "]",
    );
    if (!["high", "medium", "low"].includes(action.priority)) {
      schemaFailure("action priority is invalid");
    }
    if (priorityOrder[action.priority] < previousPriority) {
      schemaFailure("actions are not priority ordered");
    }
    previousPriority = priorityOrder[action.priority];
    if (!["shipping", "attention", "sales", "performance"].includes(action.module)) {
      schemaFailure("action module is invalid");
    }
    if (action.shopName !== null && !shopNames.has(action.shopName)) {
      schemaFailure("action shop is unknown");
    }
    assertLocalized(action.title, "actions[" + index + "].title");
    assertLocalized(action.reason, "actions[" + index + "].reason");
  });

  if (!Array.isArray(value.reviewThemes) || value.reviewThemes.length > 3) {
    schemaFailure("reviewThemes length is invalid");
  }
  value.reviewThemes.forEach((theme, index) => {
    assertKeys(
      theme,
      ["theme", "impact", "suggestion"],
      "reviewThemes[" + index + "]",
    );
    assertLocalized(theme.theme, "reviewThemes[" + index + "].theme");
    assertLocalized(theme.impact, "reviewThemes[" + index + "].impact");
    assertLocalized(theme.suggestion, "reviewThemes[" + index + "].suggestion");
  });

  return structuredClone(value);
}
