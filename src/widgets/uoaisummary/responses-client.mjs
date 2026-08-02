import OpenAI from "openai";

import { AISummaryError } from "./errors.mjs";
import { SUMMARY_JSON_SCHEMA, validateModelSummary } from "./summary-schema.mjs";

const SYSTEM_INSTRUCTIONS = [
  "You produce an executive operating summary from JSON business data.",
  "Return Japanese and Simplified Chinese in the exact schema.",
  "Use only supplied facts and metric keys; do not invent values or treat null as zero.",
  "Recommend actions only; never claim an action was executed.",
  "",
  "Action priorities:",
  "- high: leaving it until tomorrow causes a measurable loss today.",
  "- medium: it should be confirmed within this week.",
  "- low: a record-keeping confirmation with no immediate impact.",
  "",
  "Action rules:",
  "- Write only actions that are worth doing. When nothing needs attention, return exactly one low action instead of padding the list.",
  "- Set metricKey only when that metric is the evidence for the action; otherwise set it to null.",
  "- Use reviewSamples only when they point to a concrete fixable problem; never summarise sentiment.",
  "- attentionShops is already filtered to abnormal shops. An empty attentionShops list means every shop is normal.",
].join("\n");

export function deriveOpenAIEndpoint(apiUrl) {
  let endpoint;
  try {
    endpoint = new URL(apiUrl);
  } catch {
    throw new AISummaryError("configuration", "Invalid AI Responses endpoint");
  }
  if (endpoint.search || endpoint.hash || !/\/responses\/?$/.test(endpoint.pathname)) {
    throw new AISummaryError("configuration", "Invalid AI Responses endpoint");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/responses\/?$/, "");
  const baseURL = endpoint.toString().replace(/\/$/, "");
  return { baseURL, endpoint: baseURL + "/responses" };
}

export function createOpenAIClient({ config, fetcher }) {
  const { baseURL } = deriveOpenAIEndpoint(config.apiUrl);
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL,
    timeout: config.requestTimeout,
    maxRetries: 0,
    logLevel: "off",
    fetch: fetcher,
    fetchOptions: { redirect: "manual" },
  });
}

export function buildResponsesBody({ config, modelInput }) {
  return {
    model: config.model,
    instructions: SYSTEM_INSTRUCTIONS,
    input: JSON.stringify(modelInput),
    reasoning: { effort: config.reasoningEffort },
    store: false,
    max_output_tokens: 12000,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "uo_executive_summary",
        strict: true,
        schema: SUMMARY_JSON_SCHEMA,
      },
    },
  };
}

function modelHttpError(status) {
  if (status === 401 || status === 403) {
    return new AISummaryError("configuration", "Model authentication failed", {
      retryable: false,
      status,
    });
  }
  return new AISummaryError("model_http", "Model HTTP failure", {
    retryable: [408, 409, 429].includes(status) || status >= 500,
    status,
  });
}

function responseOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  const parts = (response?.output || []).flatMap((item) =>
    (item.content || [])
      .filter((part) => part?.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text),
  );
  return parts.join("");
}

export async function requestSummaryOnce({
  config,
  modelInput,
  metricKeys,
  fetcher = globalThis.fetch,
}) {
  try {
    const client = createOpenAIClient({ config, fetcher });
    const response = await client.responses.create(buildResponsesBody({ config, modelInput }), {
      maxRetries: 0,
      timeout: config.requestTimeout,
    });
    if (response?.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
      throw new AISummaryError("model_schema", "Model output hit max_output_tokens", {
        retryable: false,
      });
    }
    if (
      response?.status !== "completed" ||
      (response.output || []).some((item) => (item.content || []).some((part) => part?.type === "refusal"))
    ) {
      throw new AISummaryError("model_schema", "Model response is incomplete", {
        retryable: false,
      });
    }
    const text = responseOutputText(response);
    if (!text) {
      throw new AISummaryError("model_schema", "Model output is missing", {
        retryable: false,
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AISummaryError("model_schema", "Model output is not valid JSON", {
        retryable: false,
      });
    }
    return {
      summary: validateModelSummary(parsed, { metricKeys }),
      usage: response.usage
        ? {
            input_tokens: Number(response.usage.input_tokens) || 0,
            output_tokens: Number(response.usage.output_tokens) || 0,
            total_tokens: Number(response.usage.total_tokens) || 0,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof AISummaryError) {
      throw error;
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new AISummaryError("model_timeout", "Model request timed out", {
        retryable: true,
      });
    }
    if (Number.isInteger(error?.status)) {
      throw modelHttpError(error.status);
    }
    if (error instanceof SyntaxError) {
      throw new AISummaryError("model_schema", "Model response is not JSON");
    }
    throw new AISummaryError("model_http", "Model request failed", {
      retryable: true,
    });
  }
}
