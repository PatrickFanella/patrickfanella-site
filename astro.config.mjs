import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'

// Each page's script is one module that imports the shared boot chunk, so the browser finds the
// chunk only once the entry has arrived. Vite's own build preloaded it. Without the preload, the
// cross-document hand-over ran less often in headless Chromium (#30), so add the same hint here.
const modulePreload = {
  name: 'module-preload',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const out = fileURLToPath(dir)
      // Static imports of a built module, followed through every chunk it pulls in.
      const imports = async (src, seen = new Set()) => {
        const code = await readFile(join(out, src), 'utf8')
        for (const [, rel] of code.matchAll(/(?:from|import)\s*"(\.\/[^"]+\.js)"/g)) {
          const dep = join(dirname(src), rel)
          if (!seen.has(dep)) { seen.add(dep); await imports(dep, seen) }
        }
        return seen
      }
      for (const page of (await readdir(out, { recursive: true })).filter((f) => f.endsWith('.html'))) {
        const file = join(out, page)
        let html = await readFile(file, 'utf8')
        for (const [tag, src] of html.matchAll(/<script type="module" src="(\/[^"]+)"><\/script>/g)) {
          const links = [...await imports(src)].map((d) => `\n<link rel="modulepreload" href="${d}">`).join('')
          html = html.replace(tag, tag + links)
        }
        await writeFile(file, html)
      }
    },
  },
}

// Static output: /, /desk/ and /motion/ as directories. No client router and no UI framework;
// the pages hand over with native cross-document view transitions (site.css).
export default defineConfig({
  build: { format: 'directory' },
  // Keep the HTML as written, so the built markup matches the source.
  compressHTML: false,
  integrations: [modulePreload],
  vite: { build: { target: 'es2022' } },
})
