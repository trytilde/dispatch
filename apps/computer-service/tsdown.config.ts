import { defineConfig } from "tsdown";
export default defineConfig({ entry: ["src/index.ts"], format: ["esm"], platform: "node", fixedExtension: false, target: "node24", outDir: "dist", clean: true, sourcemap: false, deps: { alwaysBundle: [/@connectrpc\//, /@openbot\/computer-service-proto/, /@openbot\/utilities/, /handlebars/] }, outputOptions: { banner: "#!/usr/bin/env node" } });
