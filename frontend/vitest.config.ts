import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts on purpose: the UnoCSS plugin starts an
// inspector server, which tests don't need (components only use utility classes).
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'virtual-uno-css-stub',
      resolveId(id) {
        if (id === 'virtual:uno.css') {
          return '\0virtual:uno.css'
        }
      },
      load(id) {
        if (id === '\0virtual:uno.css') {
          return ''
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
})
