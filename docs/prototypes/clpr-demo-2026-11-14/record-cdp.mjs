import fs from 'node:fs'
const [,, port, url] = process.argv
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let target; for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page') } catch {}; await sleep(200) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.navigate', { url })
for (let i = 0; i < 240; i++) { await sleep(500); const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.RECORDED_OUT || null)' }); const v = r?.result?.value; if (v && v !== 'null') { fs.writeFileSync('recorded.json', JSON.stringify(JSON.parse(v), null, 1)); console.log('recorded'); process.exit(0) } }
console.log('timeout'); process.exit(1)
