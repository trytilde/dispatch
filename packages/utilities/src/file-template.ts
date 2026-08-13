import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import Handlebars from "handlebars";

export type FileTemplateValues = Readonly<Record<string, unknown>>;

/** Render a repository-owned Handlebars template with missing values rejected. */
export function renderFileTemplate(source: string, values: FileTemplateValues = {}): string {
  return Handlebars.compile(source, {
    strict: true,
    noEscape: false,
    preventIndent: true,
  })(values, {
    allowProtoMethodsByDefault: false,
    allowProtoPropertiesByDefault: false,
  });
}

export async function renderFileTemplatePath(path: string, values: FileTemplateValues = {}): Promise<string> {
  return renderFileTemplate(await readFile(path, "utf8"), values);
}

export async function materializeFileTemplate(
  templatePath: string,
  destinationPath: string,
  values: FileTemplateValues = {},
  options: { mode?: number; flag?: "w" | "wx" } = {},
): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, await renderFileTemplatePath(templatePath, values), options);
}
