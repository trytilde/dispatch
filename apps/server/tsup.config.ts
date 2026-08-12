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
  // Workspace packages are source-only and must be part of the function
  // artifact. Published npm packages remain external for Vercel to trace.
  noExternal: [/^@openbot\//],
  external: [
    "@ai-sdk/openai",
    "@ai-sdk/provider",
    "@libsql/client",
    "@vercel/sandbox",
    "drizzle-orm",
    "microsandbox",
  ],
});
