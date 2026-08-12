import { config } from "dotenv";

export async function loadLocalEnvironment(): Promise<NodeJS.ProcessEnv> {
  config({ path: [".env.local", ".env"], quiet: true });
  process.env.OPENBOT_PORT ||= process.env.TUNNEL_PORT || process.env.PORT || "4100";
  process.env.OPENBOT_WEB_PORT ||= "4173";
  return process.env;
}
