import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  noExternal: [/@connectrpc\//, /@openbot\/computer-service-proto/],
  banner: { js: "#!/usr/bin/env node" },
});
