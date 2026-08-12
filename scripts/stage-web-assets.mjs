import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(repositoryRoot, "apps/web/dist");
const destination = resolve(repositoryRoot, "public");

if (!(await stat(source)).isDirectory()) {
  throw new Error(`Web build output is not a directory: ${source}`);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
