import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The landing page, the motion set, and (spike) the generated project pages.
const dir = import.meta.dirname
const projects = Object.fromEntries(readdirSync(resolve(dir, 'projects'), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => [`p-${d.name}`, resolve(dir, 'projects', d.name, 'index.html')]))

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(dir, 'index.html'),
        motion: resolve(dir, 'motion/index.html'),
        projects: resolve(dir, 'projects/index.html'),
        ...projects,
      },
    },
  },
})
