import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import opencode from '../dist/vite/index'

export default defineConfig({
  plugins: [
    vue(),
    opencode({
      webPort: 4097,
      hostname: '127.0.0.1',
      position: 'bottom-right',
      theme: 'auto',
      autoReload: true,
      // verbose: true,
    }),
  ],
})
