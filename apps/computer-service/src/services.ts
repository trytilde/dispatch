import { execFile, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { posix } from "node:path";
import { promisify } from "node:util";
import { Code, ConnectError, type ConnectRouter, type HandlerContext } from "@connectrpc/connect";
import { ComputerService } from "@openbot/computer-service-proto";
import { agentCommand, logicalWorkspacePath } from "./agent.js";
import { validComputerServiceApiKey } from "./capability.js";
import { applyLifecycleBundle, lifecycleDigest, runLifecycle } from "./lifecycle.js";

const execute = promisify(execFile);

function authorized(context: HandlerContext): void {
  const token = process.env.OPENBOT_COMPUTER_SERVICE_API_KEY;
  if (!token || token.length < 32) throw new ConnectError("Computer service API key is not configured", Code.Unavailable);
  if (!validComputerServiceApiKey(context.requestHeader.get("authorization"), token)) throw new ConnectError("Computer service API key required", Code.PermissionDenied);
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
      const scoped = agentCommand(request.agentId, request.command, request.arguments, {
        cwd: request.cwd || "/workspace",
        environment: request.environment,
      });
      try {
        const result = await execute(scoped.command, scoped.arguments, {
          env: process.env,
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
      const scoped = agentCommand(request.agentId, "cat", [logicalWorkspacePath(request.path)]);
      return { content: await executeBytes(scoped.command, scoped.arguments, context.signal) };
    },
    async writeFile(request, context) {
      authorized(context);
      const path = logicalWorkspacePath(request.path);
      const directory = posix.dirname(path);
      const prepare = agentCommand(request.agentId, "mkdir", ["-p", directory]);
      await execute(prepare.command, prepare.arguments, { env: process.env, signal: context.signal });
      const scoped = agentCommand(request.agentId, "tee", [path]);
      await executeWithInput(scoped.command, scoped.arguments, request.content, context.signal);
      if (request.mode) {
        const chmod = agentCommand(request.agentId, "chmod", [request.mode.toString(8), path]);
        await execute(chmod.command, chmod.arguments, { env: process.env, signal: context.signal });
      }
      return { bytesWritten: BigInt(request.content.byteLength) };
    },
    async screenshot(request, context) {
      authorized(context);
      const scoped = agentCommand(request.agentId, "import", ["-display", process.env.DISPLAY ?? ":1", "-window", "root", "png:-"]);
      return { png: await executeBytes(scoped.command, scoped.arguments, context.signal, 24 * 1024 * 1024) };
    },
    async input(request, context) {
      authorized(context);
      const scoped = agentCommand(request.agentId, "xdotool", parseInput(request.action, request.payloadJson), {
        environment: { DISPLAY: process.env.DISPLAY ?? ":1" },
      });
      await execute(scoped.command, scoped.arguments, {
        env: process.env,
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

function executeBytes(command: string, args: readonly string[], signal: AbortSignal, maxBuffer = 16 * 1024 * 1024): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { encoding: "buffer", env: process.env, maxBuffer, signal }, (error, stdout) => {
      if (error) reject(error);
      else resolve(new Uint8Array(stdout));
    });
  });
}

function executeWithInput(command: string, args: readonly string[], input: Uint8Array, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env: process.env, signal, stdio: ["pipe", "ignore", "pipe"] });
    const errors: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(Buffer.concat(errors).toString("utf8") || `Computer file write exited with code ${code}`)));
    child.stdin.end(input);
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
