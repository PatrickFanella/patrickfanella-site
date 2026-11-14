// Focused check of cross-document view transitions: logs pageswap on the old page and pagereveal on the new one.
const [base, ...steps] = process.argv.slice(2)
const CDP = 'http://127.0.0.1:19514'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const logs = []
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } else if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.args.map((a) => a.value).join(' ')) })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  addEventListener('pageswap', (e) => { const n = [...document.querySelectorAll('*')].map((el) => getComputedStyle(el).viewTransitionName).filter((v) => v && v !== 'none');
    if (e.viewTransition) { e.viewTransition.ready.catch((err) => sessionStorage.setItem('swapErr', err.name + ': ' + err.message)); e.viewTransition.finished.then(() => sessionStorage.setItem('swapDone', 'ok')) } sessionStorage.removeItem('swapErr'); sessionStorage.removeItem('swapDone'); sessionStorage.setItem('swap', JSON.stringify({ from: location.pathname, vt: !!e.viewTransition, names: n, state: document.readyState, vis: document.visibilityState })) })
  addEventListener('pagereveal', (e) => { const vt = e.viewTransition; window.__vt = vt ? 'started' : 'none';
    if (vt) { vt.ready.catch((err) => { window.__vt = 'skipped: ' + err.name + ' ' + err.message }); vt.finished.then(() => { if (window.__vt === 'started') window.__vt = 'finished' }) } })` })
await send('Page.navigate', { url: base + steps[0] }); await sleep(Number(process.env.WAIT ?? 2500))
for (const sel of steps.slice(1)) {
  // A real mouse click at the link's centre, like a reader's.
  const r = JSON.parse(await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return JSON.stringify([b.x + b.width / 2, b.y + b.height / 2]) })()`))
  await sleep(300)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 })
  await sleep(1500)
  console.log(JSON.stringify({ click: sel, swap: JSON.parse(await ev(`sessionStorage.getItem('swap')`) ?? 'null'), reveal: await ev('window.__vt'), oldErr: await ev("sessionStorage.getItem('swapErr')"), at: await ev('location.pathname') }))
  await sleep(Number(process.env.WAIT ?? 2500) - 1500)
}
await fetch(`${CDP}/json/close/${target.id}`); ws.close()
