import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] },
      },
    },
  },
})
