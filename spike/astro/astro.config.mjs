import { defineConfig } from 'astro/config'

// Spike (prototype b): the same pages in Astro, reusing the site's modules and public files.
export default defineConfig({
  publicDir: '../../public',
  outDir: './dist',
  build: { format: 'directory', inlineStylesheets: process.env.INLINE ?? 'auto' },
  compressHTML: process.env.COMPRESS !== '0',
  vite: { build: { target: 'es2022' } },
})
