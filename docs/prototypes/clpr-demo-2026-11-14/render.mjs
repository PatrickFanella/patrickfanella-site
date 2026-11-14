// HTML for the demo inspector, shared by the static build (Node) and the page (browser) so the
// recorded state is real HTML before any script runs. Throwaway prototype code.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const GH = 'https://github.com/subculture-collective/clpr/blob/aa41764/backend'
export const codeLink = (file, n, label) => `<a href="${GH}/${file}#L${n}">${esc(label || `${file.split('/').pop()}:${n}`)}</a>`
const REASON = { 200: 'OK', 400: 'Bad Request', 503: 'Service Unavailable' }
export const statusText = (s) => `${s} ${REASON[s] || ''}`.trim()
export const statusClass = (s) => (s < 300 ? 'status-ok' : s < 500 ? 'status-warn' : 'status-bad')
const n = (x) => Number(x).toLocaleString('en-US')
// A URL that may only break after ? and &.
export const urlHTML = (u) => esc(u).replace(/(\?|&amp;)/g, '$1<wbr>')

export const NOTES = {
  relevance: {
    takeaway: 'Three SQL statements: count the matches, fetch the ranked page, log the query. On a big enough table PostgreSQL switches this query to the full-text index.',
    see: ['plan', 'See where it switches'],
    notes: [
      [`A <code>COUNT(*)</code> runs before the ranked select, so every page costs two queries. ${codeLink('internal/repository/search_repository.go', 183)}`, 'Fine at this size. At large result sets a capped count would save one full match scan.'],
      [`Pages use <code>LIMIT … OFFSET</code>. ${codeLink('internal/repository/search_repository.go', 213)}`, 'Deep pages read and discard every earlier row. Keyset pagination on rank and id would not.'],
      [`<code>ts_rank</code> is computed for every matching row before the sort. ${codeLink('internal/repository/search_repository.go', 177)}`, 'Ranking cost grows with the number of matches, not with the page size.'],
    ],
  },
  all: { takeaway: 'type=all fans out to clips, creators, games and tags, one query after another on one connection.', notes: [
    [`Each result type runs its own count and select in sequence. ${codeLink('internal/repository/search_repository.go', 99, 'searchClips and its siblings')}`, 'Sequential here because a single connection cannot run them in parallel. With a pool, the four types could run concurrently.']] },
  symbols: { see: ['sql', 'See the cleaned query'], takeaway: 'Clpr keeps letters and digits only, so “rock & roll” becomes rock:* & roll:* and cannot break to_tsquery.', notes: [
    [`${codeLink('internal/repository/search_repository.go', 710, 'parseQueryToTSQuery')} splits on anything that is not a letter, digit or underscore.`, 'An older version passed raw words to to_tsquery and returned 500 for this input. It was fixed before commit aa41764.']] },
  missing: { takeaway: 'Validation rejects the request before any SQL runs.', notes: [] },
  bang: { see: ['notes', 'Why this is likely a bug'], takeaway: '“!” cleans to an empty query, the full-text condition is dropped, and every clip matches, newest first.', notes: [
    [`${codeLink('internal/repository/search_repository.go', 710, 'parseQueryToTSQuery')} returns an empty string and the repository omits the match condition.`, 'Draft judgment: likely a bug. A query that cleans to nothing should get the same 400 as a missing one.']] },
  limit: { takeaway: 'A limit outside 1 to 100 is reset to 20, not clamped to 100.', notes: [
    [`${codeLink('internal/handlers/search_handler.go', 288)}`, 'Draft judgment: surprising for a client that asked for more. Clamping to 100 matches what the caller meant.']] },
  'hybrid-down': { see: ['notes', 'Why it fails closed'], takeaway: 'Production’s configured path fails closed: if OpenSearch goes down after startup, search returns 503 with Retry-After: 60 and does not fall back to PostgreSQL.', notes: [
    [`Production builds hybrid search whenever OpenSearch answers at startup. ${codeLink('cmd/api/services.go', 230)}`, 'So Clpr falls back to PostgreSQL only when OpenSearch is down at startup, and fails closed when it goes down later.'],
    [`The PostgreSQL fallback branch in the handler needs OpenSearch without hybrid search, which production never builds. ${codeLink('internal/handlers/search_handler.go', 160)}`, 'That branch is unreachable in production wiring.'],
    ['What I would change: give hybrid search the same PostgreSQL fallback for runtime OpenSearch errors, behind a flag, and report the active backend in readiness.', 'The same proposed change as the incident write-up on the home page. Not filed or fixed yet.']] },
  custom: { takeaway: 'A request you sent from the query bar.', notes: [] },
}

export const DIVERGENCES = [
  'No authentication: the handler gets no auth service.',
  'No production middleware: rate limiting, CORS and tracing are not in this demo.',
  'One database connection (pgxpool MaxConns=1). Production uses a pool.',
  'PGlite runs PostgreSQL 18.6. Production runs PostgreSQL 17.',
  'Data: 8 labeled fixture rows, plus optional synthetic rows. No production data.',
  'A demo main wires the handlers in process. There is no network socket: a 40-line net.Conn hands pgx’s wire-protocol bytes to PGlite.',
  'A recover() wrapper turns a panic into a 400 so one bad request cannot stop the worker. A release build would fail CI on any panic.',
  'The OpenSearch-down case uses a stub provider that refuses connections.',
  'Pinned to Clpr commit aa41764 (2026-11-12). Whether production runs exactly this commit was not checked.',
]

// Request path. Node ids light the path each request took.
const CHAIN = [['gin', 'Gin route'], ['handler', 'Handler'], ['repo', 'Repository'], ['pgx', 'pgx'], ['bridge', 'net.Conn bridge'], ['pglite', 'PostgreSQL']]
export function pathFor(c) {
  if (c.statements?.length) return ['page', 'gin', 'handler', 'repo', 'pgx', 'bridge', 'pglite']
  if (c.status === 503) return ['page', 'gin', 'handler', 'hybrid']
  return ['page', 'gin', 'handler']
}
export function diagram(c, { compact = false } = {}) {
  const on = new Set(c ? pathFor(c) : CHAIN.map(([id]) => id).concat('page'))
  const showHybrid = !compact && c?.status === 503 && !c.statements?.length
  const nodes = compact ? [['handler', 'Gin + SearchHandler'], ['pgx', 'pgx, wire protocol'], ['pglite', 'PostgreSQL 18.6']] : CHAIN
  const W = compact ? 168 : 112, G = compact ? 22 : 14, X0 = compact ? 10 : 96, Y = compact ? 40 : 46, H = 44
  const x = (i) => X0 + i * (W + G)
  const label = (l) => l === 'net.Conn bridge' ? `<tspan x="${'{X}'}" dy="-3">net.Conn bridge</tspan><tspan x="${'{X}'}" dy="15" class="sub">wire protocol</tspan>` : esc(l)
  const box = (id, l, i, y = Y, extra = '') => {
    const cx = x(i) + W / 2
    return `<g class="node${on.has(id) ? ' on' : ''}${extra}"><rect x="${x(i)}" y="${y}" width="${W}" height="${H}" rx="4"/><text x="${cx}" y="${y + 27}" text-anchor="middle">${label(l).replaceAll('{X}', cx)}</text></g>`
  }
  const edges = nodes.slice(1).map(([id], k) => `<line class="edge${on.has(nodes[k][0]) && on.has(id) ? ' on' : ''}" x1="${x(k) + W}" y1="${Y + H / 2}" x2="${x(k + 1)}" y2="${Y + H / 2}"/>`).join('')
  const right = x(nodes.length - 1) + W
  const worker = `<text class="boundary-label" x="${x(0) - 8}" y="${Y - 22}">Web Worker in your browser, running Clpr commit aa41764</text>
    <rect class="boundary" x="${x(0) - 10}" y="${Y - 12}" width="${right - x(0) + 20}" height="${showHybrid ? 138 : H + 24}" rx="6"/>`
  const page = compact ? '' : `<g class="node page${on.has('page') ? ' on' : ''}"><rect x="0" y="${Y}" width="78" height="${H}" rx="22"/><text x="39" y="${Y + 27}" text-anchor="middle">Page</text></g>
    <line class="edge${on.has('gin') ? ' on' : ''}" x1="78" y1="${Y + H / 2}" x2="${x(0)}" y2="${Y + H / 2}"/>`
  const hybrid = showHybrid ? `<line class="edge on" x1="${x(1) + W / 2}" y1="${Y + H}" x2="${x(1) + W / 2}" y2="${Y + 80}"/>${box('hybrid', 'Hybrid search', 1, Y + 80, ' stub')}
    <text class="end status-bad" x="${x(1) + W + 12}" y="${Y + 98}">OpenSearch refused</text><text class="end status-bad" x="${x(1) + W + 12}" y="${Y + 118}">→ 503, Retry-After: 60</text>` : ''
  const stop = c && !c.statements?.length && c.status !== 503 && !compact ? `<text class="end ${statusClass(c.status)}" x="${x(1) + W / 2}" y="${Y + H + 30}" text-anchor="middle">↳ ${esc(statusText(c.status))}, no SQL</text>` : ''
  const h = showHybrid ? Y + 150 : Y + H + (stop ? 50 : 22)
  const desc = c ? `This request went through: ${pathFor(c).join(', ')}.` : 'Clpr’s Gin route, handler and repository reach PostgreSQL through pgx and a net.Conn bridge, all inside a Web Worker.'
  return `<svg class="path${compact ? ' compact' : ''}" viewBox="-2 0 ${right + 14} ${h}" role="img" aria-labelledby="path-t path-d"><title id="path-t">Request path</title><desc id="path-d">${esc(desc)}</desc>
    ${worker}${page}${edges}${nodes.map(([id, l], i) => box(id, l, i)).join('')}${hybrid}${stop}</svg>`
}
// The same path as plain HTML, for narrow screens.
export function flow(c) {
  const on = new Set(c ? pathFor(c) : [])
  let steps = CHAIN
  if (on.has('hybrid')) steps = [CHAIN[0], CHAIN[1], ['hybrid', 'Hybrid search (OpenSearch refused)']]
  const shown = c ? steps.filter(([id]) => on.has(id)) : steps
  const end = c && !c.statements?.length ? `<li class="flow-end ${statusClass(c.status)}">${esc(statusText(c.status))}</li>` : ''
  return `<div class="flow-box"><p class="flow-cap">Web Worker in your browser, Clpr commit aa41764</p><ol class="flow" aria-label="Request path">${shown.map(([id, l]) => `<li class="${on.has(id) ? 'on' : ''}">${esc(l)}</li>`).join('')}${end}</ol></div>`
}

export function formatSQL(sql) {
  const m = sql.match(/^SELECT (.+?) FROM /i)
  let s = sql
  if (m && m[1].length > 60) {
    const lines = ['']; for (const col of m[1].split(/,\s*/)) { if ((lines.at(-1) + col).length > 68) lines.push(''); lines[lines.length - 1] += (lines.at(-1) ? ', ' : '') + col }
    s = 'SELECT\n  ' + lines.join(',\n  ') + ' FROM ' + sql.slice(m[0].length)
  }
  return s
    .replace(/\s+(FROM|WHERE|ORDER BY|GROUP BY|LIMIT|LEFT JOIN|JOIN|VALUES|RETURNING)\s/g, '\n$1 ')
    .replace(/\s+AND\s/g, '\n  AND ')
    .replace(/(ORDER BY) (.+?)\n/, (_, k, rest) => `${k}\n  ${rest.split(/,\s*(?![^(]*\))/).join(',\n  ')}\n`)
}
const params = (p) => '[' + p.map((v) => JSON.stringify(v)).join(', ') + ']'

// Readable names for round trips.
export function stepName(s) {
  const q = s.sql
  let what = 'statement'
  if (/^SELECT COUNT\(DISTINCT c\.game_id\)/i.test(q)) what = 'count games'
  else if (/^SELECT COUNT\(\*\) FROM clips/i.test(q)) what = 'count clips'
  else if (/^SELECT COUNT\(\*\) FROM users/i.test(q)) what = 'count creators'
  else if (/^SELECT COUNT\(\*\) FROM tags/i.test(q)) what = 'count tags'
  else if (/FROM clips c\s+WHERE/i.test(q) && /^SELECT c\.id/i.test(q)) what = 'ranked clips page'
  else if (/^SELECT c\.game_id/i.test(q)) what = 'games page'
  else if (/^SELECT u\.id/i.test(q)) what = 'creators page'
  else if (/^SELECT t\.id/i.test(q)) what = 'tags page'
  else if (/^INSERT INTO search_queries/i.test(q)) what = 'log the query'
  return (s.kind === 'prepare' ? 'Prepare: ' : '') + what
}

function results(c) {
  let b = c.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { return `<pre>${esc(b)}</pre>` } }
  if (b?.error) return `<p>Response body: <code>${esc(JSON.stringify(b))}</code></p>`
  const clips = b?.results?.clips || []
  const counts = b?.counts ? Object.entries(b.counts).map(([k, v]) => `${k} ${v}`).join(', ') : ''
  const table = clips.length ? `<table class="results stack"><caption class="sr">Returned clips</caption><thead><tr><th scope="col">#</th><th scope="col">Title</th><th scope="col">Creator</th><th scope="col">Votes</th><th scope="col">Created</th></tr></thead><tbody>${clips.slice(0, 6).map((r, i) => `<tr><td class="rank">${i + 1}</td><td class="title">${esc(r.title)}</td><td data-label="Creator">${esc(r.creator_name)}</td><td data-label="Votes">${r.vote_score}</td><td class="nowrap" data-label="Created">${esc(String(r.created_at).slice(0, 10))}</td></tr>`).join('')}</tbody></table>` : '<p>No clips matched.</p>'
  return table + (counts ? `<p class="muted">Matches by type: ${esc(counts)}.</p>` : '')
}

export function summary(c, mode) {
  const st = c.statements || []
  const execs = st.filter((s) => s.kind === 'execute').length
  const h = c.headers || {}
  const item = (k, v, cls = '') => `<div><dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd></div>`
  const source = item('Source', `${mode === 'live' ? 'Live, in your browser' : 'Recorded run'}, ${codeLink('', '', 'commit aa41764').replace('/blob/aa41764/backend/#L', '/tree/aa41764').replace('#L', '')}`, 'words')
  if (!st.length) return `<dl class="strip">${item('Status', esc(statusText(c.status)), statusClass(c.status))}${item('Time in browser', `${c.ms} ms`)}${h['Retry-After'] ? item('Retry-After', `${esc(h['Retry-After'])} s`) : item('SQL', 'none ran')}${c.status === 503 ? item('Fallback', 'none') : ''}${source}</dl>`
  const plan = c.plan ? (() => { const l = c.plan.find((x) => /Index Scan|Seq Scan/.test(x)); const e = c.plan.find((x) => x.startsWith('Execution Time')); return l ? item('Plan', `${esc(l.trim().replace(/^->\s*/, '').replace(/\s*\((cost|actual).*$/, '').replace(/ on clips c$/, ''))}, <span class="num">${esc(e.replace('Execution Time: ', ''))}</span>`, 'words') : '' })() : ''
  return `<dl class="strip">${item('Status', esc(statusText(c.status)), statusClass(c.status))}${item('Time in browser', `${c.ms} ms`)}${item('SQL', `<span class="num">${execs}</span> statements, <span class="num">${st.length}</span> round trips`, 'words')}${item('Rows in the table', n(c.rows))}${plan}${source}</dl>`
}

const TABS = [['response', 'Response'], ['sql', 'SQL'], ['wire', 'Wire'], ['timing', 'Timing'], ['plan', 'Plan'], ['notes', 'Notes'], ['diff', 'Production']]
export const tabList = (active) => TABS.map(([id, label]) => `<button role="tab" id="tab-${id}" aria-controls="panel" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}" data-tab="${id}">${label}</button>`).join('')

export function waterfall(c, { compact = false } = {}) {
  const st = c.statements || []
  if (!st.length) return `<p>No SQL ran. The handler answered in ${c.ms} ms.</p>`
  const total = Math.max(c.ms, ...st.map((s) => s.start + s.dur))
  const pct = (v) => ((v / total) * 100).toFixed(2)
  const w = (v) => Math.max(0.6, (v / total) * 100).toFixed(2)
  const sqlTime = st.reduce((a, s) => a + s.dur, 0)
  const nm = (full, short) => (compact ? short : full)
  const row = (name, start, dur, cls, depth = 1) => `<div class="wf-row d${depth}"><span class="wf-label">${esc(name)}</span><span class="wf-track"><span class="wf-bar ${cls}" style="margin-left:${pct(start)}%;width:${w(dur)}%"></span></span><span class="wf-ms">${dur.toFixed(dur < 10 ? 2 : 1)} ms</span></div>`
  const short = (s) => (s.kind === 'prepare' ? 'prep: ' + stepName({ ...s, kind: 'execute' }).replace(/ (clips page|the query)$/, '') : stepName(s))
  // The whole request as measured segments: inside a PostgreSQL call, or outside one.
  const segs = []; let t = 0
  for (const x of [...st].sort((a, b) => a.start - b.start)) { if (x.start > t) segs.push(['out', t, x.start - t]); segs.push(['db', x.start, x.dur]); t = Math.max(t, x.start + x.dur) }
  if (total > t) segs.push(['out', t, total - t])
  const whole = `<div class="wf-row d0"><span class="wf-label">${esc(nm('Whole request', 'Whole request'))}</span><span class="wf-track seg">${segs.map(([k, a, d]) => `<span class="wf-seg ${k}" style="left:${pct(a)}%;width:${w(d)}%"></span>`).join('')}</span><span class="wf-ms">${total.toFixed(1)} ms</span></div>`
  const rows = [whole, ...st.map((s) => row(nm(stepName(s), short(s)), s.start, s.dur, s.kind))]
  const axis = `<div class="wf-row axis" aria-hidden="true"><span></span><span class="wf-axis"><span>0 ms</span>${compact ? '' : `<span>${(total / 2).toFixed(0)} ms</span>`}<span>${total.toFixed(1)} ms</span></span><span></span></div>`
  const table = `<table class="sr-table"><caption>Round trips to PostgreSQL</caption><thead><tr><th scope="col">Step</th><th scope="col">Starts at</th><th scope="col">Duration</th></tr></thead><tbody>${st.map((s) => `<tr><td>${esc(stepName(s))}</td><td>${s.start.toFixed(2)} ms</td><td>${s.dur.toFixed(2)} ms</td></tr>`).join('')}</tbody></table>`
  const rest = total - sqlTime
  const note = compact ? '' : `<p class="muted">Measured at the bridge: ${sqlTime.toFixed(1)} ms inside PostgreSQL calls and ${rest.toFixed(1)} ms outside them, shown hatched on the first row. Outside time is spent in the Go code (Gin, the handler, pgx, the bridge) and the JavaScript around it; this demo does not break it down further. Prepares happen once per statement and are reused afterwards. Browser timings, not production latency.</p>`
  const split = `<p class="wf-legend" aria-hidden="true"><span class="key db"></span>inside PostgreSQL ${sqlTime.toFixed(1)} ms <span class="key out"></span>outside PostgreSQL ${rest.toFixed(1)} ms</p>`
  return `<div class="waterfall${compact ? ' compact' : ''}" aria-hidden="true">${rows.join('')}${axis}</div>${split}${table}${note}`
}

export function planChart(plans) {
  const pts = Object.entries(plans).map(([rows, p]) => ({ rows: +rows, ms: parseFloat(p.find((l) => l.startsWith('Execution Time')).replace('Execution Time: ', '')), index: p.some((l) => /idx_clips_search_vector/.test(l)) })).sort((a, b) => a.rows - b.rows)
  const W = 560, H = 270, L = 64, B = 46, T = 44, R = 40
  const maxR = Math.max(...pts.map((p) => p.rows)), maxM = Math.ceil(Math.max(...pts.map((p) => p.ms)) / 5) * 5
  const X = (r) => L + 14 + (r / maxR) * (W - L - R - 14), Y = (m) => T + (1 - m / maxM) * (H - T - B)
  const seq = pts.filter((p) => !p.index)
  const line = seq.map((p, i) => `${i ? 'L' : 'M'}${X(p.rows).toFixed(1)},${Y(p.ms).toFixed(1)}`).join(' ')
  const ticksX = [0, 10000, 20000, 30000, 40000, 50000].filter((t) => t <= maxR).map((t) => `<text x="${X(t)}" y="${H - 22}" text-anchor="middle">${t ? t / 1000 + 'k' : '0'}</text>`).join('')
  const ticksY = [0, maxM / 2, maxM].map((t) => `<text x="${L - 10}" y="${Y(t) + 5}" text-anchor="end">${t}</text><line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/>`).join('')
  const dots = pts.map((p) => `<circle class="${p.index ? 'idx' : 'seq'}" cx="${X(p.rows)}" cy="${Y(p.ms)}" r="6"/><text class="val" x="${X(p.rows)}" y="${Y(p.ms) - 12}" text-anchor="middle">${p.ms < 1 ? p.ms.toFixed(2) : p.ms.toFixed(1)}</text>`).join('')
  const first = pts.find((p) => p.index)
  const note = first ? `<text class="note-t" x="${X(first.rows) - 10}" y="${Y(first.ms) + 30}" text-anchor="end">index observed at ${n(first.rows)} rows</text>` : ''
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-t chart-d"><title id="chart-t">Execution time by table size</title><desc id="chart-d">${esc(pts.map((p) => `${n(p.rows)} rows: ${p.ms} ms, ${p.index ? 'full-text index' : 'sequential scan'}`).join('; '))}</desc>
    <text class="legend" x="${L}" y="18"><tspan class="seq-t">● Sequential scan</tspan><tspan dx="18" class="idx-t">● Full-text index</tspan></text>
    <text class="axis-t" x="16" y="${T + (H - T - B) / 2}" transform="rotate(-90 16 ${T + (H - T - B) / 2})" text-anchor="middle">execution, ms</text>
    <text class="axis-t" x="${L + (W - L - R) / 2}" y="${H - 2}" text-anchor="middle">rows in the table</text>
    ${ticksY}${ticksX}<path class="seq-line" d="${line}"/>${dots}${note}</svg>`
}

const MSG = { P: 'Parse', B: 'Bind', D: 'Describe', E: 'Execute', S: 'Sync', Q: 'Query', H: 'Flush',
  '1': 'ParseComplete', '2': 'BindComplete', t: 'ParameterDescription', T: 'RowDescription', n: 'NoData', C: 'CommandComplete', Z: 'ReadyForQuery', E_: 'ErrorResponse', N: 'NoticeResponse', I: 'EmptyQueryResponse' }
const msgName = (t, sent) => (sent ? MSG[t] : t === 'E' ? 'ErrorResponse' : t === 'D' ? 'DataRow' : t === 'S' ? 'ParameterStatus' : MSG[t]) || t
function group(frames, sent) {
  const out = []
  for (const [t, len] of frames) { const name = msgName(t, sent); const last = out.at(-1); if (last && last.name === name) { last.count++; last.bytes += len } else out.push({ name, count: 1, bytes: len }) }
  return out.map((m) => `<li>${esc(m.name)}${m.count > 1 ? ` ×${m.count}` : ''} <span class="bytes">${m.bytes} B</span></li>`).join('')
}
function wire(c) {
  const st = (c.statements || []).filter((s) => s.wire)
  if (!st.length) return '<p>No database messages: the handler answered before reaching PostgreSQL.</p>'
  const sum = (fr) => fr.reduce((a, [, l]) => a + l, 0)
  const sent = st.reduce((a, s) => a + sum(s.wire.sent), 0), recv = st.reduce((a, s) => a + sum(s.wire.received), 0)
  return `<p class="muted">Every byte pgx wrote to the 40-line <code>net.Conn</code> and every byte PostgreSQL wrote back, decoded by message type. ${st.length} round trips, ${n(sent)} bytes sent, ${n(recv)} bytes received.</p>
    ${st.map((s) => `<div class="rt"><p class="rt-h">${esc(stepName(s))}<span class="muted"> ${s.dur.toFixed(2)} ms</span></p><div class="rt-cols"><div><p class="dir">pgx sends</p><ul>${group(s.wire.sent, true)}</ul></div><div><p class="dir">PostgreSQL replies</p><ul>${group(s.wire.received, false)}</ul></div></div></div>`).join('')}
    <p class="muted">A prepare round trip (Parse, Describe) happens once per statement. pgx caches it, so later searches send only Bind, Execute and Sync.</p>`
}
function sqlSummary(q) {
  const where = q.match(/ WHERE (.+?)(?: ORDER BY | LIMIT | GROUP BY |$)/i)?.[1]
  const order = q.match(/ ORDER BY (.+?)(?: LIMIT |$)/i)?.[1]
  const page = q.match(/ LIMIT (\$\d+) OFFSET (\$\d+)/i)
  const rows = [where && ['Filter', where], order && ['Order', order], page && ['Page', `LIMIT ${page[1]} OFFSET ${page[2]}`]].filter(Boolean)
  return rows.length ? `<dl class="clauses">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd><code>${esc(v)}</code></dd></div>`).join('')}</dl>` : ''
}
const planLines = (lines) => lines.map((l) => {
  const indent = l.match(/^ */)[0].length, text = l.trim()
  const key = /Index Scan|Seq Scan|Execution Time/.test(l)
  return `<span class="pl${key ? ' key' : ''}${text.startsWith('->') ? ' node' : ''}" style="--i:${indent}ch">${esc(text)}</span>`
}).join('')

export function panel(tab, c, ctx) {
  if (tab === 'response') {
    const hdr = Object.entries(c.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n')
    const raw = typeof c.body === 'string' ? c.body : JSON.stringify(c.body)
    let pretty = raw; try { pretty = JSON.stringify(JSON.parse(raw), null, 2) } catch {}
    return `<p class="request"><span class="method">GET</span> <code>${urlHTML(c.url)}</code><br><span class="${statusClass(c.status)}">${esc(statusText(c.status))}</span></p>${results(c)}
      <details><summary>Raw response: headers and JSON</summary><pre class="scroll-pre">${esc(hdr)}\n\n${esc(pretty.length > 6000 ? pretty.slice(0, 6000) + '\n…' : pretty)}</pre></details>`
  }
  if (tab === 'sql') {
    const ex = (c.statements || []).filter((s) => s.kind === 'execute')
    if (!ex.length) return '<p>No SQL ran for this request.</p>'
    return ex.map((s, i) => { const sm = sqlSummary(s.sql); return `<figure class="stmt"><figcaption>${i + 1}. ${esc(stepName(s))}</figcaption>${sm ? `${sm}<details><summary>Full SQL</summary><pre class="scroll-pre">${esc(formatSQL(s.sql))}</pre></details>` : `<pre class="scroll-pre">${esc(formatSQL(s.sql))}</pre>`}${s.params.length ? `<p class="muted">Parameters: <code>${esc(params(s.params))}</code></p>` : ''}</figure>` }).join('') +
      '<p class="muted">Captured from the PostgreSQL protocol messages pgx sent, in order.</p>'
  }
  if (tab === 'timing') return waterfall(c)
  if (tab === 'wire') return wire(c)
  if (tab === 'plan') {
    const mark = planLines
    const live = c.source === 'live' ? (c.plan ? `<h3 class="plan-h">Your current request, ${n(c.rows)} rows in the table</h3><div class="plan">${mark(c.plan)}</div>` : '<p>Your current request ran no ranked clip query.</p>') : ''
    const own = c.source !== 'live' && c.id === 'relevance' ? '' : (c.source !== 'live' ? '<p>This request ran no ranked clip query. Below are the recorded plans for the relevance search.</p>' : '')
    return live + own + (ctx.plans ? planCompare(ctx, mark, c.source === 'live') : '')
  }
  if (tab === 'notes') {
    const ns = NOTES[c.id]?.notes || []
    return ns.length ? ns.map(([fact, judgment]) => `<div class="note"><p>${fact}</p><p class="judgment">${judgment}</p></div>`).join('') : '<p>No notes for this request.</p>'
  }
  const probe = ctx.probe ? `<p class="prod">Production, measured ${esc(ctx.probe.at)} from one machine in Chicago: the same search answered ${ctx.probe.ok} of ${ctx.probe.n} requests, median ${ctx.probe.median} ms, slowest ${ctx.probe.max} ms.</p>` : ''
  const curl = c.url.startsWith('/api/') ? `<p class="muted">Try the same request against production: <code class="copy">curl '${urlHTML('https://clpr.tv' + c.url)}'</code></p>` : ''
  return `${probe}${curl}<h3 class="plan-h">How this demo differs from production</h3><ul class="divergences">${DIVERGENCES.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
}

function est(p) {
  const l = p.find((x) => /Seq Scan on|Bitmap Heap Scan on|Index Scan using/.test(x)) || ''
  const m = l.match(/cost=[\d.]+\.\.([\d.]+) rows=(\d+).*?actual.*?rows=([\d.]+)/)
  return m ? { cost: Math.round(+m[1]), estRows: +m[2], actual: Math.round(+m[3]) } : null
}
function crossover(plans, keys) {
  const a = est(plans[keys.at(-2)]), b = est(plans[keys.at(-1)])
  const gin = plans[keys.at(-1)].find((l) => /Bitmap Index Scan on/.test(l))?.match(/cost=[\d.]+\.\.([\d.]+)/)?.[1]
  if (!a || !b || !gin) return ''
  return `<p class="why"><strong>Why the switch comes late:</strong> the planner costs the sequential scan by table size, ${n(a.cost)} at ${n(keys.at(-2))} rows, while the full-text index lookup alone is costed at about ${n(Math.round(+gin))} before any rows are fetched. At ${n(keys.at(-1))} rows the whole index plan came to ${n(b.cost)}, and PostgreSQL chose it. The match estimates are far off in both runs: ${n(a.estRows)} and ${n(b.estRows)} expected, ${a.actual} matched. Prefix terms such as <code>world:*</code> are hard to estimate.</p>`
}
function planCompare(ctx, mark, afterLive) {
  const keys = Object.keys(ctx.plans).sort((a, b) => a - b)
  const scan = (p) => p.find((l) => /Index Scan|Seq Scan/.test(l)).trim().replace(/^->\s*/, '').replace(/\s*\((cost|actual).*$/, '')
  const exec = (p) => p.find((l) => l.startsWith('Execution Time')).replace('Execution Time: ', '')
  return `<h3 class="plan-h">${afterLive ? 'Recorded comparison, not your request' : 'How the plan changes with table size'}</h3>
    <div class="plan-compare">${planChart(ctx.plans)}
    <div class="scroll"><table class="results"><caption class="sr">Recorded plans by table size</caption><thead><tr><th scope="col">Rows</th><th scope="col">PostgreSQL chose</th><th scope="col">Execution</th></tr></thead><tbody>${keys.map((k) => `<tr><td class="nowrap">${n(k)}</td><td>${esc(scan(ctx.plans[k]))}</td><td class="nowrap">${esc(exec(ctx.plans[k]))}</td></tr>`).join('')}</tbody></table></div></div>
    <p class="muted">The relevance search, recorded in a browser at each table size. PostgreSQL scanned at every size up to ${n(keys.at(-2))} rows and used the full-text index <code>idx_clips_search_vector</code> at ${n(keys.at(-1))}, so for this fixture and query the switch lies somewhere between the two.</p>
    ${crossover(ctx.plans, keys)}
    <details${afterLive ? '' : ' open'}><summary>Full plan at ${n(keys.at(-1))} rows</summary><div class="plan">${mark(ctx.plans[keys.at(-1)])}</div></details>`
}

export function inspector(c, mode, ctx, tab = 'response') {
  return `<h2 id="case-title">${esc(mode === 'live' ? `Live: ${c.label || 'Your request'}` : c.label)}${c.simulated ? ' <span class="badge">Simulated fault</span>' : ''}</h2>
    <p class="takeaway" id="case-summary">${esc(NOTES[c.id]?.takeaway || '')}${NOTES[c.id]?.see ? ` <button type="button" class="linklike" data-tab="${NOTES[c.id].see[0]}">${esc(NOTES[c.id].see[1])}</button>` : ''}</p>
    ${summary(c, mode)}
    <div class="diagram-wrap">${diagram(c)}</div>${flow(c)}
    <div class="tabs" role="tablist" aria-label="Inspector">${tabList(tab)}</div>
    <div class="panel" role="tabpanel" id="panel" aria-labelledby="tab-${tab}" tabindex="0">${panel(tab, c, ctx)}</div>`
}
