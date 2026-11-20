import { readFile } from 'node:fs/promises'
import { contentSecurityPolicy, redirects, routePaths } from '../src/content/site-facts.mjs'

// The Caddyfile and the edge script are hand-written. This fails when their policy, redirects or
// required pages drift from src/content/site-facts.mjs, apart from the differences listed here.
const intended = [
  // Kept as found (#102) until the owner says whether it is meant. Only the edge serves the public
  // HTTPS host; the origin and `astro preview` are reached over plain HTTP.
  { file: 'deploy/edge-route.py', extra: 'upgrade-insecure-requests', reason: 'only the public HTTPS edge upgrades insecure requests' },
]

const root = new URL('../', import.meta.url)
const read = file => readFile(new URL(file, root), 'utf8')
const directives = policy => policy.split(';').map(directive => directive.trim().replace(/\s+/g, ' ')).filter(Boolean)
const failures = []
const policies = {
  'deploy/origin.Caddyfile': /^\s*Content-Security-Policy "([^"]*)"$/m,
  'deploy/edge-route.py': /^CSP = "([^"]*)"$/m,
}
for (const [file, pattern] of Object.entries(policies)) {
  const source = await read(file)
  const actual = directives(source.match(pattern)?.[1] ?? '')
  const expected = [...directives(contentSecurityPolicy), ...intended.filter(difference => difference.file === file).map(difference => difference.extra)]
  if (actual.join('; ') !== expected.join('; ')) {
    failures.push(`${file}: Content-Security-Policy differs from site-facts.mjs\n  missing: ${expected.filter(d => !actual.includes(d)).join('; ') || 'none'}\n  unexpected: ${actual.filter(d => !expected.includes(d)).join('; ') || 'none'}${actual.length === expected.length && expected.every(d => actual.includes(d)) ? '\n  the order changed' : ''}`)
  }
  // Redirects are built as static pages from site-facts.mjs; neither deploy file may add its own.
  if (/^\s*(redir|rewrite|uri)\b/m.test(source)) failures.push(`${file}: declares a redirect or rewrite; the ${Object.keys(redirects).length} redirects belong in site-facts.mjs`)
}
// deploy/update.py refuses a release without these pages; each must still be a route.
const required = [...(await read('deploy/update.py')).matchAll(/'([^']*index\.html)'/g)].map(([, file]) => `/${file.replace(/index\.html$/, '')}`)
if (!required.length) failures.push('deploy/update.py: no required pages found')
for (const path of required) if (!routePaths().includes(path)) failures.push(`deploy/update.py: requires ${path}, which is not a route in site-facts.mjs`)

if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`Deploy files match site-facts.mjs: 2 policies, no deploy-side redirects, ${required.length} required pages. Intended differences: ${intended.map(d => `${d.file} adds ${d.extra} (${d.reason})`).join('; ')}.`)
