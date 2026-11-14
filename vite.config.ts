import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Two static pages for now: the landing page and the motion set.
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        motion: resolve(import.meta.dirname, 'motion/index.html'),
      },
    },
  },
})
