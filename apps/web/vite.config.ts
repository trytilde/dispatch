import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const controlOrigin = `http://127.0.0.1:${process.env.OPENBOT_PORT || "4100"}`;

export default defineConfig({
  base: "./",
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  server: {
    proxy: {
      "/api": controlOrigin,
      "/healthz": controlOrigin,
      "/rpc": controlOrigin,
    },
  },
  build: { target: "es2024" },
});
