import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const sourceRoot = resolve("src");
const outputRoot = resolve("dist");
const copiedExtensions = new Set([".css", ".hbs", ".svg"]);
// Vendored runtime files below an assets directory (for example the Tilde browser extension) ship
// verbatim regardless of extension; everything else must be a template or stylesheet.
const vendoredAssetSegment = `${sep}assets${sep}`;

async function copyAssets(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const source = join(directory, entry.name);
      if (entry.isDirectory()) return copyAssets(source);
      if (!entry.isFile()) return;
      if (!copiedExtensions.has(extname(entry.name)) && !source.includes(vendoredAssetSegment))
        return;
      const destination = join(outputRoot, relative(sourceRoot, source));
      await mkdir(dirname(destination), { recursive: true });
      await cp(source, destination);
    }),
  );
}

await copyAssets(sourceRoot);
