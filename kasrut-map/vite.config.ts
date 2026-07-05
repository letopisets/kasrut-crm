/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  server: { port: 5174 },
  build: {
    rollupOptions: {
      output: {
        // Splitting heavy vendor groups so a code-only deploy doesn't bust
        // the maplibre/mui chunks (which dominate first-paint cost). Order
        // matches what the user-perceived load tree actually fetches.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('maplibre') || id.includes('react-map-gl')) return 'vendor-maplibre'
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
    alias: { '@': resolve(__dirname, './src') },
  },
})
