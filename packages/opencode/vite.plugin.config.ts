import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/plugins/page-context.ts"),
      name: "PageContextPlugin",
      fileName: () => "page-context.js",
      formats: ["es"],
    },
    outDir: "es/plugins",
    emptyOutDir: false,
    rollupOptions: {
      external: [], // bundle everything, including @vite-plugin-opencode-assistant/shared
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
