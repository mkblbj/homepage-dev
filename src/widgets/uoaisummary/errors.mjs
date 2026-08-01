export class AISummaryError extends Error {
  constructor(code, message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = "AISummaryError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function publicErrorCode(error) {
  const allowed = new Set([
    "configuration",
    "source_timeout",
    "source_unavailable",
    "model_timeout",
    "model_http",
    "model_schema",
    "cache",
    "unexpected",
  ]);
  return allowed.has(error?.code) ? error.code : "unexpected";
}
