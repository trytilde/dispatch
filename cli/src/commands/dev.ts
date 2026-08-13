import { loadLocalEnvironment, publicDevelopmentEnvironment } from "../environment.js";
import { run, runChecked, supervise } from "../processes.js";

export async function runDevelopment(): Promise<never> {
  const env = await loadLocalEnvironment();
  const publicEnvironment = publicDevelopmentEnvironment(env);
  await runChecked("pnpm", ["contracts:generate"], env);

  const serverPort = env.OPENBOT_PORT ?? "4100";
  const webPort = env.OPENBOT_WEB_PORT ?? "4173";
  console.log(`OpenBot web: http://127.0.0.1:${webPort}`);
  console.log(`OpenBot control and agent server: http://127.0.0.1:${serverPort}`);

  const server = run(
    "pnpm",
    ["--filter", "@openbot/cli", "exec", "tsx", "watch", "src/index.tsx", "_serve"],
    env,
  );
  const web = run(
    "pnpm",
    ["--filter", "@openbot/web", "dev", "--port", webPort],
    publicEnvironment,
  );
  const children = [server, web];

  const canLaunchDesktop =
    env.OPENBOT_NO_DESKTOP !== "1" &&
    (process.platform === "darwin" || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY));
  if (canLaunchDesktop) {
    const desktopEnv = {
      ...publicEnvironment,
      OPENBOT_CONTROL_ORIGIN: `http://127.0.0.1:${serverPort}`,
      OPENBOT_DESKTOP_DEV_URL: `http://127.0.0.1:${webPort}`,
    };
    children.push(run("pnpm", ["--filter", "@openbot/desktop", "dev"], desktopEnv));
  } else {
    console.log(
      "OpenBot desktop: skipped (set DISPLAY/WAYLAND_DISPLAY, or run on macOS; OPENBOT_NO_DESKTOP=1 disables it explicitly)",
    );
  }

  return supervise(children);
}
