import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  noExternal: [/@connectrpc\//, /@openbot\/contracts/],
  banner: { js: "#!/usr/bin/env node" },
});
