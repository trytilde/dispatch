import { execFile } from "node:child_process";
import { createConnection } from "node:net";
import { promisify } from "node:util";
import { Code, ConnectError, type ConnectRouter, type HandlerContext } from "@connectrpc/connect";
import { ComputerService } from "@openbot/computer-service-proto";
import { validComputerCapability } from "./capability.js";
import { readWorkspaceFile, workspaceRoot, writeWorkspaceFile } from "./files.js";
import { applyLifecycleBundle, lifecycleDigest, runLifecycle } from "./lifecycle.js";

const execute = promisify(execFile);

function authorized(context: HandlerContext): void {
  const token = process.env.OPENBOT_COMPUTER_CAPABILITY;
  if (!token || token.length < 32) throw new ConnectError("Computer capability is not configured", Code.Unavailable);
  if (!validComputerCapability(context.requestHeader.get("authorization"), token)) throw new ConnectError("Computer capability required", Code.PermissionDenied);
}

async function vncReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number(process.env.OPENBOT_COMPUTER_VNC_PORT ?? 5901) });
    const finish = (ready: boolean) => { socket.destroy(); resolve(ready); };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

export function registerComputerService(router: ConnectRouter): void {
  router.service(ComputerService, {
    async health(_request, context) {
      authorized(context);
      return { healthy: true, version: "0.1.0", lifecycleDigest: await lifecycleDigest(), vncReady: await vncReady() };
    },
    async applyLifecycleBundle(request, context) {
      authorized(context);
      return { digest: request.digest, changed: await applyLifecycleBundle(request) };
    },
    async runLifecycle(request, context) {
      authorized(context);
      return { digest: await lifecycleDigest(), results: await runLifecycle(request.phase, request.expectedDigest, context.signal) };
    },
    async exec(request, context) {
      authorized(context);
      try {
        const result = await execute(request.command, request.arguments, {
          cwd: request.cwd || workspaceRoot(),
          env: { ...process.env, ...request.environment },
          signal: context.signal,
          timeout: request.timeoutMilliseconds || 120_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
        return { exitCode: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
      }
    },
    async readFile(request, context) {
      authorized(context);
      return { content: await readWorkspaceFile(request.path) };
    },
    async writeFile(request, context) {
      authorized(context);
      return { bytesWritten: BigInt(await writeWorkspaceFile(request.path, request.content, request.mode || undefined)) };
    },
    async screenshot(_request, context) {
      authorized(context);
      const result = await execute("import", ["-display", process.env.DISPLAY ?? ":1", "-window", "root", "png:-"], {
        encoding: "buffer",
        maxBuffer: 24 * 1024 * 1024,
        signal: context.signal,
      });
      return { png: new Uint8Array(result.stdout) };
    },
    async input(request, context) {
      authorized(context);
      await execute("xdotool", parseInput(request.action, request.payloadJson), {
        env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":1" },
        signal: context.signal,
      });
      return { accepted: true };
    },
    async listPorts(_request, context) {
      authorized(context);
      const ports = (process.env.OPENBOT_COMPUTER_EXPOSED_PORTS ?? "6080,4101").split(",").map(Number).filter((port) => Number.isSafeInteger(port) && port > 0 && port <= 65_535);
      return { ports: ports.map((port) => ({ port, protocol: "tcp" })) };
    },
    async *tunnelVnc(request, context) {
      authorized(context);
      const socket = createConnection({ host: "127.0.0.1", port: Number(process.env.OPENBOT_COMPUTER_VNC_PORT ?? 5901) });
      const writer = (async () => {
        for await (const frame of request) {
          if (!socket.write(frame.data)) await new Promise<void>((resolve) => socket.once("drain", resolve));
        }
        socket.end();
      })();
      const abort = () => socket.destroy(new Error("VNC tunnel aborted"));
      context.signal.addEventListener("abort", abort, { once: true });
      try {
        for await (const data of socket) yield { data: new Uint8Array(data) };
        await writer;
      } finally {
        context.signal.removeEventListener("abort", abort);
        socket.destroy();
      }
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
