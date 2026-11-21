import { defineConfig } from 'vite'

// Relative base so the same `dist/` can be hosted on Vercel or copied
// into a Capacitor `webDir` later without rewriting asset URLs.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
})
