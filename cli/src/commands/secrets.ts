import arg from "arg";
import { setEncryptedSecret, unsetEncryptedSecret } from "../initialization.js";
import { repositoryRoot } from "../paths.js";
import { inkPrompts } from "./init.js";

export async function runSecrets(argv: readonly string[]): Promise<void> {
  const parsed = arg({}, { argv: [...argv] });
  const [operation, name, ...extra] = parsed._;
  if (!operation || !name || extra.length)
    throw new Error("Usage: openbot secrets <set|unset> NAME");
  if (operation === "set") {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error("openbot secrets set requires an interactive terminal");
    const value = await inkPrompts.input(`Value for ${name}`, { secret: true, required: true });
    await setEncryptedSecret(repositoryRoot, name, value);
    return;
  }
  if (operation === "unset") {
    await unsetEncryptedSecret(repositoryRoot, name);
    return;
  }
  throw new Error(`Unknown secrets operation: ${operation}`);
}
