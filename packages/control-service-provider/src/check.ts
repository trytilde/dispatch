import type { DeploymentContext } from "@trytilde/dispatch-runtime-provider";
import { runNativeCheck, type CommandRunner } from "./command.js";

export async function checkControlService(
  context: DeploymentContext,
  runner: CommandRunner,
): Promise<void> {
  await runNativeCheck(runner, context.repositoryRoot, context.environment, [
    "apps/control-service/tsconfig.json",
    "apps/web/tsconfig.json",
  ]);
}
