// Per-page JS and CSS weight from a built dist: follows script/link tags and static JS imports.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
const [dist, ...pages] = process.argv.slice(2)
const gz = (b) => gzipSync(b, { level: 9 }).length
for (const page of pages) {
  const html = readFileSync(join(dist, page), 'utf8')
  const js = new Set(), css = new Set(); let inlineCss = ''
  for (const m of html.matchAll(/<script[^>]*src="([^"]+)"/g)) js.add(m[1])
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) js.add(m[1])
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) css.add(m[1])
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) inlineCss += m[1]
  const queue = [...js]
  while (queue.length) {
    const u = queue.pop(); const src = readFileSync(join(dist, u), 'utf8')
    for (const m of src.matchAll(/(?:import|from)\s*["']([^"']+\.js)["']/g)) {
      const v = m[1].startsWith('/') ? m[1] : join(dirname(u), m[1]); if (!js.has(v)) { js.add(v); queue.push(v) }
    }
  }
  const sum = (set) => [...set].reduce((a, u) => { const b = readFileSync(join(dist, u)); return [a[0] + b.length, a[1] + gz(b)] }, [0, 0])
  const [jr, jg] = sum(js), [cr, cg] = sum(css)
  const ib = Buffer.from(inlineCss)
  const hb = Buffer.from(html)
  console.log(JSON.stringify({ page, html: [hb.length, gz(hb)], js: [jr, jg], jsFiles: js.size, css: [cr + ib.length, cg + gz(ib)], cssFiles: css.size, inlineCss: ib.length }))
}
