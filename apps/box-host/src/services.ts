import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Code, ConnectError, type ConnectRouter, type HandlerContext } from "@connectrpc/connect";
import { BoxService } from "@openbot/contracts";
import { validCapability } from "./capability.js";
import { readWorkspaceFile, workspaceRoot, writeWorkspaceFile } from "./files.js";

const execute = promisify(execFile);

function authorized(context: HandlerContext): void {
  const token = process.env.OPENBOT_BOX_CAPABILITY;
  if (!token || token.length < 32) throw new ConnectError("Box host capability is not configured", Code.Unavailable);
  if (!validCapability(context.requestHeader.get("authorization"), token)) throw new ConnectError("Box capability required", Code.PermissionDenied);
}

export function registerBoxService(router: ConnectRouter): void {
  router.service(BoxService, {
    async health(_request, context) { authorized(context); return { healthy: true, version: "0.1.0" }; },
    async exec(request, context) {
      authorized(context);
      try {
        const result = await execute(request.command, request.arguments, {
          cwd: workspaceRoot(), signal: context.signal, timeout: request.timeoutSeconds ? request.timeoutSeconds * 1000 : 120_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
        return { exitCode: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
      }
    },
    async readFile(request, context) { authorized(context); return { content: await readWorkspaceFile(request.path) }; },
    async writeFile(request, context) { authorized(context); return { bytesWritten: BigInt(await writeWorkspaceFile(request.path, request.content)) }; },
    async screenshot(_request, context) {
      authorized(context);
      const result = await execute("import", ["-display", process.env.DISPLAY ?? ":1", "-window", "root", "png:-"], { encoding: "buffer", maxBuffer: 24 * 1024 * 1024, signal: context.signal });
      return { png: new Uint8Array(result.stdout) };
    },
    async input(request, context) {
      authorized(context);
      const payload = parseInput(request.action, request.payloadJson);
      await execute("xdotool", payload, { env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":1" }, signal: context.signal });
      return { accepted: true };
    },
    async listPorts(_request, context) {
      authorized(context);
      const ports = (process.env.OPENBOT_EXPOSED_PORTS ?? "6080,4101").split(",").map(Number).filter((port) => Number.isSafeInteger(port) && port > 0 && port <= 65_535);
      return { ports: ports.map((port) => ({ port, protocol: "tcp", url: `http://127.0.0.1:${port}` })) };
    },
  });
}

function parseInput(action: string, raw: string): string[] {
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { throw new ConnectError("Input payload must be JSON", Code.InvalidArgument); }
  if (action === "mouse_move") return ["mousemove", "--sync", integer(payload.x), integer(payload.y)];
  if (action === "click") return ["click", String(payload.button ?? 1)];
  if (action === "type") return ["type", "--delay", String(payload.delayMs ?? 10), String(payload.text ?? "")];
  if (action === "key") return ["key", String(payload.key ?? "")];
  throw new ConnectError(`Unsupported input action: ${action}`, Code.InvalidArgument);
}

function integer(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ConnectError("Input coordinates must be integers", Code.InvalidArgument);
  return String(value);
}
