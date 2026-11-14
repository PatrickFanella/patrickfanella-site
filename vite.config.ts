import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The content security policy the site is served with: patrickfanella.co's production policy, plus
// 'wasm-unsafe-eval' and worker-src for PostgreSQL on the desk. The homelab preview sends the same
// header (patrickfanella-preview's origin.Caddyfile on Almaz); keep the two in step. `vite preview`
// sends it too, so the browser tests fail on any violation.
const CSP = "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'"

// Three static pages for now: the landing page, the desk and the motion set.
export default defineConfig({
  build: {
    target: 'es2022',
    // Never inline assets as data: URLs. Small font subsets would otherwise land in the CSS as
    // data:font/woff2, which font-src 'self' blocks.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        desk: resolve(import.meta.dirname, 'desk/index.html'),
        motion: resolve(import.meta.dirname, 'motion/index.html'),
      },
    },
  },
  preview: { headers: { 'Content-Security-Policy': CSP } },
})
