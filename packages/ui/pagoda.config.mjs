import { defineConfig } from "@pagoda-cli/core";

export default defineConfig({
  name: "@aipanel/ui",
  build: {
    mode: "components",
    namedExport: true,
    packageManager: "pnpm",
    umd: false,
    bundle: false,
    extensions: {
      esm: ".mjs",
      cjs: ".cjs",
    },
    esbuildOptions: {
      target: "es2020",
    },
  },
});
