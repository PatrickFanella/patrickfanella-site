// @ts-check
// The recorded Clpr run, defined once: the table sizes it covers, the sources its fingerprint binds
// it to, and its shape. Plain JavaScript without Node imports, so astro.config.mjs, the node scripts,
// Astro frontmatter, the tests, the worker and the page scripts can all import it. It never imports
// recorded-run.json: callers hand the data in, which keeps the recording out of client bundles.

/** @typedef {ReturnType<typeof parseRecording>} Recording */
/** @typedef {Recording['meta']} RecordingMeta */

/** Labelled fixture clips the worker seeds; they stay in the table at every size. */
export const fixtureCount = 8
/** Table sizes the Plan tab offers and the recording covers: the fixtures plus generated clips. */
export const tableSizes = [0, 1000, 10000, 30000, 50000].map(generated => fixtureCount + generated)

/** Files that decide what the worker does and how it is recorded. A change to any needs a new recording. */
const inputs = [
  'astro.config.mjs',
  'src/content/site-facts.mjs',
  'scripts/record-clpr.mjs',
  'src/desk/inspector/recording.mjs',
  'package-lock.json',
  'public/clpr/manifest.json',
  'src/desk/clpr.worker.ts',
  'src/desk/clpr-protocol.ts',
  'src/desk/worker-replies.ts',
  'src/desk/worker-client.mjs',
  'src/desk/inspector/capture.ts',
  'src/desk/inspector/wire.ts',
  'src/desk/inspector/plans.ts',
]

/**
 * The hex fingerprint of the recording's inputs: each path and its bytes, in order.
 * @param {{ update(data: string | Uint8Array): unknown, digest(encoding: 'hex'): string }} sha256 A fresh `createHash('sha256')`.
 * @param {(path: string) => string | Uint8Array} read `readFileSync`, from the repository root.
 */
export function sourceFingerprint(sha256, read) {
  for (const path of inputs) { sha256.update(path); sha256.update('\0'); sha256.update(read(path)); sha256.update('\0') }
  return sha256.digest('hex')
}

/** @param {string} what @returns {never} */
const reject = what => { throw new TypeError(`Invalid Clpr recording: ${what}`) }
/** @param {unknown} value @param {string} name @param {RegExp} [pattern] */
const text = (value, name, pattern = /./) => typeof value === 'string' && pattern.test(value) ? value : reject(name)
/** A finite number, positive unless `min` says otherwise. @param {unknown} value @param {string} name */
const number = (value, name, min = Number.MIN_VALUE) => typeof value === 'number' && Number.isFinite(value) && value >= min ? value : reject(name)
/** @param {unknown} value @param {string} name @returns {any} */
const record = (value, name) => typeof value === 'object' && value !== null ? value : reject(name)
/** @param {unknown} value @param {string} name @returns {any[]} */
const list = (value, name) => Array.isArray(value) ? value : reject(name)
const sha = /^[a-f0-9]{64}$/, commit = /^[a-f0-9]{40}$/

/** Decoded wire messages, one hex byte per counted byte. Their fields are kept as given. @param {unknown} value @param {string} name */
const messages = (value, name) => /** @type {import('./wire').WireMessage[]} */ (list(value, name).map(message => {
  if (!message?.name || !(message.bytes > 0) || typeof message.hex !== 'string' || message.hex.split(' ').length !== message.bytes) reject(`${name}: ${message?.name}`)
  return message
}))

/** One search at one table size. Statements and PostgreSQL's plan trees are kept as given. @param {any} result @param {number} index */
function parseResult(result, index) {
  const at = `results[${index}]`
  if (result?.ev !== 'result' || result.rows !== tableSizes[index]) reject(`${at}.rows`)
  const response = record(result.response, `${at}.response`), plan = record(result.plan, `${at}.plan`)
  if (result.url !== '/api/v1/search?q=world+record&type=clips' || response.status !== 200) reject(`${at}.response`)
  let body
  try { body = JSON.parse(response.body) } catch { reject(`${at}.response.body`) }
  if (body?.counts?.clips !== 2 || body.results?.clips?.length !== 2) reject(`${at}.response.body`)
  if (plan.rows !== result.rows) reject(`${at}.plan.rows`)
  for (const kind of ['natural', 'seq', 'gin']) {
    number(plan[kind]?.Plan?.['Total Cost'], `${at}.plan.${kind}`, -Infinity)
    number(plan[kind]['Execution Time'], `${at}.plan.${kind}`, -Infinity)
  }
  const calls = list(result.calls, `${at}.calls`)
  if (!calls.length) reject(`${at}.calls`)
  return {
    ev: /** @type {const} */ ('result'),
    id: number(result.id, `${at}.id`, 0),
    url: /** @type {string} */ (result.url),
    response: {
      status: /** @type {number} */ (response.status),
      body: /** @type {string} */ (response.body),
      headers: /** @type {Record<string, string>} */ (record(response.headers, `${at}.response.headers`)),
    },
    ms: number(result.ms, `${at}.ms`, 0),
    calls: calls.map(call => ({
      ms: number(call?.ms, `${at}.calls.ms`, 0),
      statements: /** @type {import('./capture').Statement[]} */ (list(call.statements, `${at}.calls.statements`)),
      sent: messages(call.sent, `${at}.calls.sent`),
      received: messages(call.received, `${at}.calls.received`),
    })),
    rows: /** @type {number} */ (result.rows),
    plan: /** @type {import('./plans').PlanSample} */ ({ rows: plan.rows, natural: plan.natural, seq: plan.seq, gin: plan.gin }),
  }
}

/**
 * The one definition of a recording. The recorder writes what this returns, the checker and the
 * Inspector read through it, and its return type is the Recording type. Throws
 * `Invalid Clpr recording: <field>` on a missing or malformed field. The return value is rebuilt
 * from the fields named here, so comparing it with the input also finds unknown fields; wire
 * messages, statements and PostgreSQL's plan trees are passed through.
 * @param {any} value
 */
export function parseRecording(value) {
  if (value?.schemaVersion !== 1) reject('schemaVersion')
  const meta = record(value.meta, 'meta'), memory = record(meta.memory, 'meta.memory'), budget = record(meta.budget, 'meta.budget')
  const results = list(value.results, 'results')
  if (results.length !== tableSizes.length) reject('results')
  const parsed = {
    schemaVersion: /** @type {1} */ (1),
    meta: {
      recordedAt: text(meta.recordedAt, 'meta.recordedAt'),
      siteCommit: text(meta.siteCommit, 'meta.siteCommit', commit),
      sourceFingerprint: text(meta.sourceFingerprint, 'meta.sourceFingerprint', sha),
      clprCommit: text(meta.clprCommit, 'meta.clprCommit', commit),
      workerSha256: text(meta.workerSha256, 'meta.workerSha256', sha),
      browser: text(meta.browser, 'meta.browser'),
      platform: text(meta.platform, 'meta.platform'),
      ciRun: meta.ciRun === null ? null : text(meta.ciRun, 'meta.ciRun', /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/),
      wasmGzipBytes: number(meta.wasmGzipBytes, 'meta.wasmGzipBytes'),
      downloadBytes: number(meta.downloadBytes, 'meta.downloadBytes'),
      downloads: /** @type {Record<string, number>} */ (Object.fromEntries(Object.entries(record(meta.downloads, 'meta.downloads'))
        .map(([path, bytes]) => [path, number(bytes, `meta.downloads[${path}]`)]))),
      startupMs: number(meta.startupMs, 'meta.startupMs', 0),
      memory: {
        metric: text(memory.metric, 'meta.memory.metric', /^sampled Chromium process-tree RSS$/),
        peakBytes: number(memory.peakBytes, 'meta.memory.peakBytes'),
        sampleIntervalMs: number(memory.sampleIntervalMs, 'meta.memory.sampleIntervalMs'),
        // The live gate refuses fewer samples; fail here instead of shipping live mode off.
        samples: number(memory.samples, 'meta.memory.samples', 2),
      },
      budget: {
        maxWasmGzipBytes: number(budget.maxWasmGzipBytes, 'meta.budget.maxWasmGzipBytes'),
        maxPeakRssBytes: number(budget.maxPeakRssBytes, 'meta.budget.maxPeakRssBytes'),
      },
      postgres: text(meta.postgres, 'meta.postgres'),
      migrations: number(meta.migrations, 'meta.migrations'),
    },
    results: results.map(parseResult),
  }
  const { downloadBytes, downloads, wasmGzipBytes } = parsed.meta
  if (!Number.isFinite(Date.parse(parsed.meta.recordedAt))) reject('meta.recordedAt')
  // The gate also refuses a download smaller than the Wasm it includes.
  if (downloadBytes < wasmGzipBytes || downloadBytes !== Object.values(downloads).reduce((sum, bytes) => sum + bytes, 0)) reject('meta.downloadBytes')
  return parsed
}
