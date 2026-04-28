import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        "page-context": resolve(__dirname, "src/plugins/page-context.ts"),
        "vite-logs": resolve(__dirname, "src/plugins/vite-logs.ts"),
        "service-logs": resolve(__dirname, "src/plugins/service-logs.ts"),
      },
      name: "OpenCodePlugins",
      formats: ["es"],
    },
    outDir: "es/plugins",
    emptyOutDir: false,
    ssr: true, // 指定为 Node.js 环境，不会外部化 Node.js 内置模块
    rollupOptions: {
      external: [], // bundle everything, including @vite-plugin-opencode-assistant/shared
      output: {
        // 禁用代码分割，每个入口打包成独立单文件
        chunkFileNames: "[name].js",
        // 强制不提取共享代码到单独 chunk
        manualChunks: undefined,
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
