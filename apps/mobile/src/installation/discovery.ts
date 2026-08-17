import {
  ControlServiceHealthSchema,
  NativeAuthConfigurationSchema,
  type ClientInstallation,
  type FetchLike,
} from "@tryopenbot/client-runtime";

export function normalizeControlOrigin(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("Enter your OpenBot control service URL");
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  if (url.username || url.password)
    throw new Error("The control service URL cannot contain credentials");
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("Enter the control service origin without a path, query, or fragment");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname)))
    throw new Error("Control services must use HTTPS outside loopback development");
  return url.origin;
}

export async function discoverControlService(
  value: string,
  request: FetchLike,
): Promise<ClientInstallation> {
  const controlOrigin = normalizeControlOrigin(value);
  ControlServiceHealthSchema.parse(await requestJson(request, `${controlOrigin}/healthz`));
  const configuration = NativeAuthConfigurationSchema.parse(
    await requestJson(request, `${controlOrigin}/auth/native-config`),
  );
  assertSecureEndpoint(configuration.authorization_endpoint, "authorization");
  assertSecureEndpoint(configuration.token_endpoint, "token");
  return { control_origin: controlOrigin, ...configuration };
}

async function requestJson(request: FetchLike, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await request(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenBot discovery failed (${response.status})`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("The control service did not respond in time");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function assertSecureEndpoint(value: string, label: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname)))
    throw new Error(`The ${label} endpoint must use HTTPS`);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
