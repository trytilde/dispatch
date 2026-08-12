import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/vercel.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
});
