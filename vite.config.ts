import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Three static pages for now: the landing page, the desk and the motion set.
export default defineConfig({
  // The desk's PostgreSQL worker imports PGlite, which code-splits, so workers build as ES modules.
  worker: { format: 'es' },
  // Pre-bundling would move PGlite away from the .wasm and .data files it finds next to itself.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        desk: resolve(import.meta.dirname, 'desk/index.html'),
        motion: resolve(import.meta.dirname, 'motion/index.html'),
      },
    },
  },
})
