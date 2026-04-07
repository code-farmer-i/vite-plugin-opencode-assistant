import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import opencode from "../dist/vite/index";

export default defineConfig({
  plugins: [
    vue(),
    opencode({
      enabled: true,
      // verbose: true,
    }),
  ],
});
