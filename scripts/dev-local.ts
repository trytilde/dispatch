import { chmod } from "node:fs/promises";
import { migrate } from "@openbot/db";
import { loadLocalEnvironment, validateLocalSandboxHost } from "./local-env.js";
import { run, runChecked, supervise } from "./processes.js";

const env = await loadLocalEnvironment();
const sandbox = await validateLocalSandboxHost();
await runChecked("pnpm", ["contracts:generate"], env);
await runChecked("pnpm", ["--filter", "@openbot/box-host", "build"], env);
await migrate();
await chmod(".data/local-setup-code", 0o600).catch(() => undefined);

const serverPort = env.OPENBOT_PORT ?? "4100";
const webPort = env.OPENBOT_WEB_PORT ?? "4173";
console.log(`OpenBot: ${sandbox.message}`);
console.log(`OpenBot web: http://127.0.0.1:${webPort}`);
console.log(`OpenBot control server: http://127.0.0.1:${serverPort}`);
console.log(`OpenBot setup code: ${env.OPENBOT_SETUP_CODE}`);

const server = run("pnpm", ["--filter", "@openbot/server", "dev"], env);
const web = run("pnpm", ["--filter", "@openbot/web", "dev", "--port", webPort], env);
const children = [server, web];

const canLaunchDesktop = env.OPENBOT_NO_DESKTOP !== "1"
  && (process.platform === "darwin" || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY));
if (canLaunchDesktop) {
  const desktopEnv = {
    ...env,
    OPENBOT_CONTROL_ORIGIN: `http://127.0.0.1:${serverPort}`,
    OPENBOT_DESKTOP_DEV_URL: `http://127.0.0.1:${webPort}`,
  };
  children.push(run("pnpm", ["--filter", "@openbot/desktop", "dev"], desktopEnv));
} else {
  console.log("OpenBot desktop: skipped (set DISPLAY/WAYLAND_DISPLAY, or run on macOS; OPENBOT_NO_DESKTOP=1 disables it explicitly)");
}

await supervise(children);
