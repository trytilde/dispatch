import { resolve } from "node:path";
import type { OpenBotConfiguration } from "@tryopenbot/configuration";
import { formatAgentLifecycleProgress, reconcileAgentResources } from "../agent-lifecycle.js";
import { loadConfigurationModule } from "../configuration-loader.js";
import {
  reconcileDevelopmentInfrastructure,
  watchDevelopmentComputer,
} from "../development-lifecycle.js";
import { loadLocalEnvironment, publicDevelopmentEnvironment } from "../environment.js";
import { repositoryRoot } from "../paths.js";
import { run, runChecked, supervise } from "../processes.js";
import { inkPrompts } from "./init.js";

export async function runDevelopment(): Promise<never> {
  const env = await loadLocalEnvironment({
    prompts: process.stdin.isTTY && process.stdout.isTTY ? inkPrompts : undefined,
  });
  const serverPort = env.PORT ?? "4100";
  const configuration = await loadDevelopmentConfiguration(env);
  console.log("Preparing OpenBot development infrastructure");
  await reconcileDevelopmentInfrastructure({
    repositoryRoot,
    environment: env,
    providers: configuration.providers,
  });
  await reconcileAgentResources({
    repositoryRoot,
    environment: env,
    providers: configuration.providers,
    devMode: true,
    report: (event) => {
      const line = formatAgentLifecycleProgress(event);
      if (line) console.log(line);
    },
  });
  const computerWatcher = await watchDevelopmentComputer({
    repositoryRoot,
    environment: env,
    providers: configuration.providers,
    onRebuildStarted: () => console.log("Computer image changed; rebuilding Microsandbox"),
    onRebuildComplete: () => console.log("Computer restarted with the updated image"),
    onRebuildError: (error) =>
      console.error(
        `Computer rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });
  process.once("exit", () => computerWatcher.close());
  const publicEnvironment = publicDevelopmentEnvironment(env);
  await runChecked("pnpm", ["contracts:generate"], env);

  const webPort = env.WEB_PORT ?? "4173";
  console.log(`OpenBot web: http://127.0.0.1:${webPort}`);
  console.log(`OpenBot control and agent HMR server: http://127.0.0.1:${serverPort}`);

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

export async function loadDevelopmentConfiguration(
  environment: NodeJS.ProcessEnv,
): Promise<OpenBotConfiguration> {
  const path = resolve(repositoryRoot, "configuration/index.ts");
  const module = await loadConfigurationModule<{ default?: OpenBotConfiguration }>(
    path,
    environment,
  );
  if (!module.default)
    throw new Error("configuration/index.ts must export the OpenBot configuration as default");
  return module.default;
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
