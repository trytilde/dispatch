import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function workspaceRoot(): string {
  return resolve(process.env.OPENBOT_WORKSPACE_ROOT ?? "/workspace");
}

export function workspacePath(path: string): string {
  const root = workspaceRoot();
  const target = resolve(root, isAbsolute(path) ? `.${path}` : path);
  const child = relative(root, target);
  if (child.startsWith("..") || isAbsolute(child)) throw new Error("Path is outside the sandbox workspace");
  return target;
}

export async function readWorkspaceFile(path: string): Promise<Uint8Array> {
  return readFile(workspacePath(path));
}

export async function writeWorkspaceFile(path: string, content: Uint8Array): Promise<number> {
  const target = workspacePath(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  return content.byteLength;
}
