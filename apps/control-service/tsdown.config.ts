import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/app.ts", "src/service.ts"],
  format: ["esm"],
  platform: "node",
  fixedExtension: false,
  target: "node24",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: false,
});
