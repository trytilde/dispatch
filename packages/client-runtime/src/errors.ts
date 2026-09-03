export class ClientRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClientRequestError";
  }
}

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "Dispatch request failed";
}
