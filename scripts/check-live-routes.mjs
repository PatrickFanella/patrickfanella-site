import { readFile } from 'node:fs/promises'

const base = process.argv[2] ?? 'https://patrickfanella.co'
const expected = process.argv.find(arg => arg.startsWith('--revision='))?.slice(11)
const xml = await readFile('docs/evidence/current-site-sitemap.xml', 'utf8')
const paths = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname))
for (const path of ['/desk/', '/motion/', '/case-studies/clpr-search/', '/assets/patrick_fanella_resume.pdf', '/robots.txt', '/sitemap.xml', '/REVISION']) paths.add(path)
for (const path of paths) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  const body = await response.text()
  if (!body.length) throw new Error(`${path}: empty response`)
  if (path === '/REVISION' && (!/^[a-f0-9]{40}\s*$/.test(body) || (expected && body.trim() !== expected))) throw new Error('Public build does not match the expected revision')
  if (path === '/desk/' && !body.includes('data-inspector-recording')) throw new Error('The recorded desk is absent')
  if (path === '/' && !response.headers.get('content-security-policy')?.includes("'wasm-unsafe-eval'")) throw new Error('Production CSP does not allow the desk worker')
  if (path === '/robots.txt' && /Disallow:\s*\//i.test(body)) throw new Error('Production robots.txt disallows indexing')
  if (response.headers.get('x-robots-tag')?.includes('noindex')) throw new Error(`${path}: production still sends noindex`)
  console.log(`${path}: ${response.status}${response.redirected ? ` via redirect to ${new URL(response.url).pathname}` : ''}`)
}
