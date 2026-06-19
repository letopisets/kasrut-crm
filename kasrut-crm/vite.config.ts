import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // Splitting heavy vendor groups so a code-only deploy preserves the
        // cache for the heavy ones. Mirrors the kasrut-map config.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
          if (id.includes('@reduxjs') || id.includes('react-redux')) return 'vendor-redux'
          if (id.includes('@sentry')) return 'vendor-sentry'
          if (id.includes('react-router')) return 'vendor-router'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('scheduler')
          ) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
