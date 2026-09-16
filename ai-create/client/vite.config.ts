import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'validation', test: /node_modules[\\/]zod/ }, { name: 'vendor', test: /node_modules/ }] } } } },
  resolve: { alias: { '@contracts': fileURLToPath(new URL('../../server/src/contracts', import.meta.url)) } },
  server: { proxy: { '/api': 'http://127.0.0.1:3001' }, strictPort: true },
})
