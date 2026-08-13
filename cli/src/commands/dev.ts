import { loadLocalEnvironment, publicDevelopmentEnvironment } from "../environment.js";
import { run, runChecked, supervise } from "../processes.js";

export async function runDevelopment(): Promise<never> {
  const env = await loadLocalEnvironment();
  const publicEnvironment = publicDevelopmentEnvironment(env);
  await runChecked("pnpm", ["contracts:generate"], env);

  const serverPort = env.PORT ?? "4100";
  const webPort = env.WEB_PORT ?? "4173";
  console.log(`OpenBot web: http://127.0.0.1:${webPort}`);
  console.log(`OpenBot control and agent server: http://127.0.0.1:${serverPort}`);

  const [serverCommand, serverArguments] = developmentServerCommand();
  const server = run(serverCommand, serverArguments, developmentServerEnvironment(env));
  const web = run(
    "pnpm",
    ["--filter", "@tryopenbot/web", "dev", "--port", webPort],
    publicEnvironment,
  );
  const children = [server, web];

  const canLaunchDesktop =
    env.NO_DESKTOP !== "1" &&
    (process.platform === "darwin" || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY));
  if (canLaunchDesktop) {
    const desktopEnv = {
      ...publicEnvironment,
      CONTROL_ORIGIN: `http://127.0.0.1:${serverPort}`,
      DESKTOP_DEV_URL: `http://127.0.0.1:${webPort}`,
    };
    children.push(run("pnpm", ["--filter", "@tryopenbot/desktop", "dev"], desktopEnv));
  } else {
    console.log(
      "OpenBot desktop: skipped (set DISPLAY/WAYLAND_DISPLAY, or run on macOS; NO_DESKTOP=1 disables it explicitly)",
    );
  }

  return supervise(children);
}

export function developmentServerCommand(): readonly [string, readonly string[]] {
  return ["pnpm", ["exec", "tsx", "watch", "cli/src/index.tsx", "_serve"]];
}

export function developmentServerEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nodeOptions = environment.NODE_OPTIONS?.trim();
  return {
    ...environment,
    NODE_OPTIONS: [nodeOptions, "--conditions=development"].filter(Boolean).join(" "),
  };
}
