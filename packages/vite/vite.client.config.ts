import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/client/index.ts"),
      name: "OpenCodeWidgetClient",
      fileName: "client",
      formats: ["es"],
    },
    outDir: "lib",
    emptyOutDir: false,
    rollupOptions: {
      // Don't externalize vue or components, we want them bundled into client.js
      external: [],
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
