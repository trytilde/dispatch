import { defineConfig } from "tsdown";
export default defineConfig({ entry: ["src/main.ts", "src/preload.ts"], format: ["cjs"], platform: "node", target: "node24", outDir: "dist", clean: true, sourcemap: false, deps: { neverBundle: ["electron"] }, outputOptions: { entryFileNames: "[name].cjs" } });
