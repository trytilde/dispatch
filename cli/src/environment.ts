import { config } from "dotenv";
import { resolve } from "node:path";
import { repositoryRoot } from "./paths.js";

export async function loadLocalEnvironment(): Promise<NodeJS.ProcessEnv> {
  const deploymentEnvironment = process.env.OPENBOT_DEPLOYMENT_ENV_FILE;
  config({
    path: [
      ...(deploymentEnvironment ? [deploymentEnvironment] : []),
      resolve(repositoryRoot, ".env.local"),
      resolve(repositoryRoot, ".env"),
    ],
    quiet: true,
  });
  const environment = process.env;
  environment.OPENBOT_PORT ||= environment.TUNNEL_PORT || environment.PORT || "4100";
  environment.OPENBOT_WEB_PORT ||= "4173";
  return environment;
}
