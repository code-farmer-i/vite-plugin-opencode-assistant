import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/opencode/plugins/page-context.ts'),
      name: 'PageContextPlugin',
      fileName: () => 'page-context.js',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@opencode-ai/plugin'],
      output: {
        dir: 'dist/opencode/plugins',
        globals: {
          '@opencode-ai/plugin': 'Plugin',
        },
      },
    },
    minify: false,
    sourcemap: true,
    emptyOutDir: false,
  },
})
