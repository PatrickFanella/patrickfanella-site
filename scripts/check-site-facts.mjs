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
const redirecting = /\b(redir|rewrite|handle_path)\b|\buri\s+(strip_prefix|strip_suffix|replace|path_regexp)\b|\bLocation\b|\brespond\b[^\n]*\b30[12378]\b/
const policies = {
  'deploy/origin.Caddyfile': /^\s*Content-Security-Policy "([^"]*)"$/gm,
  'deploy/edge-route.py': /^CSP = "([^"]*)"$/gm,
}
// `policies` only sees the form each file uses today; these catch a second policy written another way.
// The edge script also names the header inside the pattern that swaps its policy in, so its constant is counted instead.
const onlyOnce = {
  'deploy/origin.Caddyfile': { 'the Content-Security-Policy header name': /Content-Security-Policy/gi },
  'deploy/edge-route.py': { 'an assignment to CSP': /\bCSP\s*(?::[^=\n]*)?(?:[-+*/%|&^@]|\/\/|\*\*|<<|>>)?=(?!=)/g, 'default-src': /default-src/g },
}
for (const [file, pattern] of Object.entries(policies)) {
  const source = await read(file)
  const found = [...source.matchAll(pattern)]
  if (found.length !== 1) failures.push(`${file}: expected one Content-Security-Policy, found ${found.length}`)
  for (const [what, counted] of Object.entries(onlyOnce[file])) {
    const count = source.match(counted)?.length ?? 0
    if (count !== 1) failures.push(`${file}: expected ${what} once, found ${count}; a second policy would not be compared`)
  }
  const actual = directives(found[0]?.[1] ?? '')
  const expected = [...directives(contentSecurityPolicy), ...intended.filter(difference => difference.file === file).map(difference => difference.extra)]
  if (actual.join('; ') !== expected.join('; ')) {
    failures.push(`${file}: Content-Security-Policy differs from site-facts.mjs\n  missing: ${expected.filter(d => !actual.includes(d)).join('; ') || 'none'}\n  unexpected: ${actual.filter(d => !expected.includes(d)).join('; ') || 'none'}${actual.length === expected.length && expected.every(d => actual.includes(d)) ? '\n  the order changed' : ''}`)
  }
  // Redirects are built as static pages from site-facts.mjs; neither deploy file may add its own.
  // The edge script holds Caddy text inside Python strings, so this searches the whole text, not line starts.
  if (redirecting.test(source) || Object.keys(redirects).some(old => source.includes(old))) failures.push(`${file}: declares a redirect or rewrite; the ${Object.keys(redirects).length} redirects belong in site-facts.mjs`)
}
// deploy/update.py refuses a release without these pages; each must still be a route.
const required = [...(await read('deploy/update.py')).matchAll(/'([^']*index\.html)'/g)].map(([, file]) => `/${file.replace(/index\.html$/, '')}`)
if (!required.length) failures.push('deploy/update.py: no required pages found')
for (const path of required) if (!routePaths().includes(path)) failures.push(`deploy/update.py: requires ${path}, which is not a route in site-facts.mjs`)

if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`Deploy files match site-facts.mjs: 2 policies, no deploy-side redirects, ${required.length} required pages. Intended differences: ${intended.map(d => `${d.file} adds ${d.extra} (${d.reason})`).join('; ')}.`)
