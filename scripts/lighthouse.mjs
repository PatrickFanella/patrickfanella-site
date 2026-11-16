import lighthouse from 'lighthouse'
import { launch } from 'chrome-launcher'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const local = process.argv.includes('--local')
const base = local ? 'http://127.0.0.1:4189' : (process.argv.find(arg => arg.startsWith('https://')) ?? 'https://patrickfanella.co')
const paths = process.argv.find(arg => arg.startsWith('--paths='))?.slice(8).split(',') ?? ['/', '/projects/', '/resume/', '/contact/', '/desk/', '/case-studies/clpr/', '/case-studies/clustr/', '/case-studies/rekolekt/', '/case-studies/undertow/']
const directory = process.env.LIGHTHOUSE_OUTPUT ?? 'test-results/lighthouse'
await mkdir(directory, { recursive: true })
let server
try {
  if (local) {
    server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', '4189', '--ignore-lock'], { stdio: 'ignore' })
    let ready = false
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error('The local Lighthouse server could not start')
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* Wait for this process's listener. */ }
      await setTimeout(100)
    }
    if (!ready) throw new Error('The local Lighthouse server did not become ready')
  }
  const results = [], failures = []
  for (const path of paths) {
    const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'], logLevel: 'silent' })
    try {
      const { lhr, report } = await lighthouse(new URL(path, base).href, { port: chrome.port, logLevel: 'error', output: 'json', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] })
      const scores = Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, value.score]))
      const cls = lhr.audits['cumulative-layout-shift'].numericValue
      // Observe the audited page after measurement; never alter its graphics path.
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`)
      let graphics
      try {
        const session = await browser.newBrowserCDPSession()
        const { gpu } = await session.send('SystemInfo.getInfo')
        const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url() === lhr.finalDisplayedUrl)
        graphics = { devices: gpu.devices, features: gpu.featureStatus, staticInkFallback: page ? await page.evaluate(() => document.documentElement.classList.contains('no-ink')) : null }
      } finally { await browser.close() }
      const result = { path, finalUrl: lhr.finalDisplayedUrl, scores, cls, lcpMs: lhr.audits['largest-contentful-paint'].numericValue, tbtMs: lhr.audits['total-blocking-time'].numericValue, runtimeError: lhr.runtimeError, graphics, benchmarkIndex: lhr.environment.benchmarkIndex, userAgent: lhr.environment.hostUserAgent }
      results.push(result); console.log(JSON.stringify(result))
      await writeFile(`${directory}/${path.replaceAll('/', '_') || 'home'}.json`, report)
      for (const [key, minimum] of [['performance', 0.9], ['accessibility', 0.95], ['best-practices', 0.95], ['seo', 0.95]]) {
        if (scores[key] < minimum || scores[key] === null) failures.push(`${path} ${key}: ${scores[key]} < ${minimum}`)
      }
      if (cls > 0.05 || !Number.isFinite(cls)) failures.push(`${path} CLS: ${cls}`)
      if (lhr.runtimeError) failures.push(`${path}: ${lhr.runtimeError.message}`)
    } finally { await chrome.kill() }
  }
  await writeFile(`${directory}/summary.json`, JSON.stringify({ measuredAt: new Date().toISOString(), base, mobile: true, physicalDevice: false, graphics: 'Chrome default; per-page graphics and fallback state recorded below', results, failures }, null, 2) + '\n')
  if (failures.length) throw new Error(failures.join('\n'))
} finally {
  // Only the foreground Astro process this invocation started.
  if (server?.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)) }
}
