import { loadLocalEnvironment } from "./local-env.js";
import { run, supervise } from "./processes.js";

const env = await loadLocalEnvironment();
const child = run("pnpm", ["dev:local"], env);
await supervise([child]);
