/** Extract the HTTP status exposed by Tilde SDK and generated-client failures. */
export function tildeErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("status" in error && typeof error.status === "number") return error.status;
  const response = "response" in error ? error.response : undefined;
  return response instanceof Response ? response.status : undefined;
}

/** Normalize the different error shapes returned by Tilde clients. */
export function tildeErrorMessage(error: unknown, fallback = "Tilde request failed"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") return error.message;
    if ("msg" in error && typeof error.msg === "string") return error.msg;
  }
  return fallback;
}
