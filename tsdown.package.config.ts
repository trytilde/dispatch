import { defineConfig } from "tsdown";

declare const process: { cwd(): string };

export default defineConfig({
  cwd: process.cwd(),
  entry: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/**/*.d.ts",
  ],
  format: ["esm"],
  platform: "node",
  fixedExtension: false,
  target: "es2024",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: false,
  unbundle: true,
  dts: true,
});
