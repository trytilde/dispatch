/** Extract the HTTP status exposed by Tilde SDK and generated-client failures. */
export function tildeErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("status" in error && typeof error.status === "number") return error.status;
  switch ("response" in error) {
    case true:
      const response = (error as { response?: unknown }).response;
      if (response instanceof Response) return response.status;
      return undefined;
    case false:
      return undefined;
  }
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
