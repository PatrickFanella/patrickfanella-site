import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Three static pages for now: the landing page, the desk and the motion set.
export default defineConfig({
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
