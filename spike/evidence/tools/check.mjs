// Drives headless Chromium over CDP (Node's built-in WebSocket) against one preview server.
import { writeFileSync } from 'node:fs'
const [base, label, shots] = process.argv.slice(2)
const CDP = 'http://127.0.0.1:19514'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const events = []
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } else events.push(d) })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.text }
const go = async (url, wait = 2500) => { await send('Page.navigate', { url }); await sleep(wait) }
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shots}/${label}-${name}.png`, Buffer.from(r.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  addEventListener('pagereveal', (e) => { const vt = e.viewTransition; window.__vt = vt ? 'started' : 'none';
    if (vt) { vt.ready.catch((err) => { window.__vt = 'skipped: ' + err.name }); vt.finished.then(() => { if (window.__vt === 'started') window.__vt = 'finished' }) } })` })

const state = `(() => { const h = document.querySelector('[data-pour-in]'); const ls = [...document.querySelectorAll('[data-ink-letter]')];
  const c = document.getElementById('ink'); return JSON.stringify({ title: document.title, noInk: document.documentElement.classList.contains('no-ink'),
  canvas: c ? c.width + 'x' + c.height : null, letters: ls.length, poured: ls.filter((l) => l.dataset.pour).length, landed: ls.filter((l) => l.classList.contains('landed')).length,
  vt: window.__vt ?? null, h1: document.querySelector('h1')?.textContent.trim().slice(0, 40) }) })()`
const weight = `JSON.stringify(performance.getEntriesByType('resource').reduce((a, e) => { const k = e.name.endsWith('.js') ? 'js' : e.name.endsWith('.css') ? 'css' : e.name.endsWith('.woff2') ? 'font' : 'other'; a[k] = (a[k] ?? 0) + e.encodedBodySize; return a }, { html: performance.getEntriesByType('navigation')[0].encodedBodySize }))`
const out = {}
// 1. Fresh load of a project page: ink, pour-in, weight as the browser sees it.
await go(`${base}/projects/clpr/`, 3500)
out.clprLoad = JSON.parse(await ev(state)); out.clprWeight = JSON.parse(await ev(weight))
await shot('clpr-light')
// 2. Hand-over: index -> project (card title morphs into the heading), project -> landing, landing -> motion.
await go(`${base}/projects/`, 2500); await shot('index-light')
out.indexLoad = JSON.parse(await ev(state))
await ev(`document.querySelector('a[href="/projects/clpr/"]').click()`); await sleep(250); await shot('vt-mid-index-to-clpr'); await sleep(1500)
out.indexToClpr = JSON.parse(await ev(state))
await ev(`document.querySelector('.bar .mark').click()`); await sleep(1800)
out.clprToLanding = JSON.parse(await ev(state))
await ev(`document.querySelector('a[href="/motion/"]').click()`); await sleep(1800)
out.landingToMotion = JSON.parse(await ev(state))
await ev(`document.querySelector('a[href="/projects/"]') ? 'x' : 'no projects link on motion'`)
// 3. Dark theme.
await go(`${base}/projects/clpr/`, 2500); await ev(`document.querySelector('[data-theme-switch]').click()`); await sleep(2500); await shot('clpr-dark')
out.clprDark = await ev(`document.documentElement.dataset.theme`)
await ev(`localStorage.removeItem('pf-theme')`)
// 4. Reduced motion: letters start in place, still frame.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await go(`${base}/projects/`, 2000); await ev(`document.querySelector('a[href="/projects/clpr/"]').click()`); await sleep(1500)
out.reducedClpr = JSON.parse(await ev(state)); await shot('clpr-reduced')
await send('Emulation.setEmulatedMedia', { features: [] })
// 5. No JavaScript: the content is in the HTML.
await send('Emulation.setScriptExecutionDisabled', { value: true })
await go(`${base}/projects/clpr/`, 1500)
await send('Emulation.setScriptExecutionDisabled', { value: false })
const dom = await send('DOM.getDocument', { depth: -1 })
const html = (await send('DOM.getOuterHTML', { nodeId: dom.result.root.nodeId })).result.outerHTML
out.noJs = { hasH1: /<h1[^>]*>.*Clpr/s.test(html), hasProblem: html.includes('The problem'), sections: (html.match(/<section/g) ?? []).length }
await shot('clpr-nojs')
console.log(JSON.stringify(out, null, 1))
await fetch(`${CDP}/json/close/${target.id}`); ws.close()
