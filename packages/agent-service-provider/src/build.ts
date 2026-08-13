import { readFile } from "node:fs/promises";

export function bundleOptions(cwd: string, entry: string, outDir: string, filename: string, minify: boolean) {
  return { cwd, entry: [entry], format: "esm" as const, platform: "node" as const, target: "node24", outDir, clean: false, minify, sourcemap: false, outputOptions: { entryFileNames: filename } };
}

export async function renderTemplate(path: string, values: Readonly<Record<string, string>>): Promise<string> {
  let template = await readFile(path, "utf8");
  for (const [name, value] of Object.entries(values)) template = template.replaceAll(`__OPENBOT_${name}__`, value);
  if (/__OPENBOT_[A-Z_]+__/.test(template)) throw new Error(`Unresolved provider template value in ${path}`);
  return template;
}
