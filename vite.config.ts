import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      ".agents/**",
      "**/*.md",
      "apps/server/src/generated/**",
      "apps/web/src/routeTree.gen.ts",
      "packages/contracts/src/gen/**",
      "packages/ui/src/beautiful-ui/upstream/**",
    ],
  },
  lint: {
    ignorePatterns: [
      ".agents/**",
      "apps/server/src/generated/**",
      "apps/web/src/routeTree.gen.ts",
      "packages/contracts/src/gen/**",
      "packages/ui/src/beautiful-ui/upstream/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
