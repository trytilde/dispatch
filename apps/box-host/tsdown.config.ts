import { defineConfig } from "tsdown";
export default defineConfig({ entry: ["src/index.ts"], format: ["esm"], platform: "node", fixedExtension: false, target: "node18", outDir: "dist", clean: true, sourcemap: false, deps: { alwaysBundle: [/@connectrpc\//, /@openbot\/contracts/] }, outputOptions: { banner: "#!/usr/bin/env node" } });
