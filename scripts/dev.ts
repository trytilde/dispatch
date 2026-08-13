import { loadLocalEnvironment } from "./local-env.js";
import { run, supervise } from "./processes.js";

const env = await loadLocalEnvironment();
const tunnelConfigured = Boolean(env.TILDE_BEARER_TOKEN || env.TILDE_API_KEY);

if (tunnelConfigured) {
  console.log("OpenBot: Tilde credentials found; requesting a production Tilde tunnel.");
  const child = run("vp", ["exec", "tilde", "tunnel", "--", "vp", "run", "dev:local"], env);
  await supervise([child]);
} else {
  console.log(
    "OpenBot: Tilde is unconfigured; starting the complete local workspace without a tunnel.",
  );
  const child = run("vp", ["run", "dev:local"], env);
  await supervise([child]);
}
