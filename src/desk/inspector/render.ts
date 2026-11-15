// Shared by Astro at build time and the live inspector. Every captured string is
// escaped here; SQL, clip titles and protocol payloads never become page markup.
import type { ClprEvent } from '../clpr-protocol'
import type { PlanNode, PlanSample } from './plans'
import type { Statement } from './capture'

export type Result = Extract<ClprEvent, { ev: 'result' }>
export const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pre = (value: unknown) => `<pre tabindex="0">${escape(value)}</pre>`
const json = (value: unknown) => JSON.stringify(value, null, 2)
export const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })
export const scan = (node: PlanNode): string => node['Index Name'] === 'idx_clips_search_vector' ? 'GIN bitmap scan'
  : node['Node Type'] === 'Seq Scan' ? 'Sequential scan' : (node.Plans ?? []).map(scan).find(Boolean)
    ?? (node['Node Type'].includes('Scan') ? `${node['Node Type']}${node['Index Name'] ? ` on ${node['Index Name']}` : ''}` : '')

export function responseMarkup(event: Result) {
  let body: unknown
  try { body = JSON.parse(event.response.body) } catch { /* Preserve non-JSON replies verbatim. */ }
  const clips = (body as { results?: { clips?: { title?: unknown }[] } } | null)?.results?.clips
  const summary = Array.isArray(clips) ? `${clips.length} returned ${clips.length === 1 ? 'clip' : 'clips'}${clips.length
    ? `: ${clips.map(clip => String(clip.title ?? 'Untitled')).join('; ')}` : '. No matching clips.'}` : 'This response contains no clip result list.'
  return `<p>${escape(summary)}</p><h4>Raw headers</h4>${pre(`HTTP ${event.response.status}\n${Object.entries(event.response.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}`)}
    <h4>JSON response</h4>${pre(body === undefined ? event.response.body : json(body))}`
}

function clauses(statement: Statement) {
  const sql = statement.sql.replace(/\s+/g, ' ').trim()
  return '<dl>' + ([
    ['Read', /\bFROM (.+?)(?=\bWHERE\b|\bORDER BY\b|\bLIMIT\b|$)/i],
    ['Filter', /\bWHERE (.+?)(?=\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/i],
    ['Order', /\bORDER BY (.+?)(?=\bLIMIT\b|\bOFFSET\b|$)/i],
    ['Limit', /\bLIMIT (.+?)(?=\bOFFSET\b|$)/i], ['Offset', /\bOFFSET (.+)$/i],
    ['Write', /\bINSERT INTO (.+?)(?=\bVALUES\b|$)/i],
  ] as const).map(([label, pattern]) => { const match = pattern.exec(sql); return match ? `<dt>${label}</dt><dd>${escape(match[1].trim())}</dd>` : '' }).join('') + '</dl>'
}

export function sqlMarkup(event: Result) {
  const statements = event.calls.flatMap(call => call.statements), executions = statements.filter(statement => statement.kind === 'execute').length
  return `<p>${executions} executions; ${statements.length - executions} prepares. Statements and parameter formats captured from pgx. Binary parameters are shown as hex bytes; their types are not guessed.</p>`
    + (statements.length ? statements.map((statement, index) => `<section><h4>${index + 1}. ${statement.kind === 'prepare' ? 'Prepare' : 'Execute'}</h4>${clauses(statement)}
      <details><summary>Full SQL</summary>${pre(statement.sql)}</details>${statement.kind === 'execute' ? `<p>Parameters ($1, $2, … in order)</p>${pre(json(statement.params))}` : ''}</section>`).join('') : '<p>This request sent no SQL statements.</p>')
}

export function timingMarkup(event: Result) {
  const inside = event.calls.reduce((sum, call) => sum + call.ms, 0)
  return `<dl data-timing>${([['Total handler request', event.ms], ['Inside PostgreSQL calls', inside], ['Outside PostgreSQL calls', event.ms - inside]] as const)
    .map(([label, value]) => `<dt>${label}</dt><dd data-ms="${value}">${value.toFixed(1)} ms</dd>`).join('')}</dl>
    <p>${event.calls.length} bridge calls. Inside time is wall time awaiting execProtocolRaw, including protocol work and PostgreSQL. Outside time is the request total minus those calls: Go, Gin, pgx, bridge and JavaScript overhead together. These parts are not measured separately. Browser clock rounding applies; these are fixture timings, not production latency.</p>`
}

export function wireMarkup(event: Result) {
  return '<p>Actual PostgreSQL protocol bytes at the in-process pgx bridge, grouped by call. Counts include the type byte and four-byte length. These are not network packets or network latency.</p>'
    + (event.calls.length ? event.calls.map((call, index) => `<h4>Call ${index + 1}: ${call.sent.reduce((sum, m) => sum + m.bytes, 0)} bytes sent, ${call.received.reduce((sum, m) => sum + m.bytes, 0)} bytes received; ${call.ms.toFixed(1)} ms</h4>`
      + ([['pgx → PostgreSQL', call.sent], ['PostgreSQL → pgx', call.received]] as const).map(([label, messages]) => `<p>${escape(label)}</p><ol>${messages.map(m => `<li>${escape(`${m.name} (${m.type || 'untyped'}): ${m.bytes} bytes. ${m.detail}`)}<details><summary>Raw message hex</summary>${pre(m.hex)}</details></li>`).join('')}</ol>`).join('')).join('') : '<p>This request made no PostgreSQL bridge calls.</p>')
}

export function planMarkup(points: PlanSample[], selected: PlanSample, live: boolean) {
  const seq = selected.seq.Plan['Total Cost'], gin = selected.gin.Plan['Total Cost'], chosen = scan(selected.natural.Plan) || selected.natural.Plan['Node Type']
  const firstGin = points.findIndex(point => point.gin.Plan['Total Cost'] < point.seq.Plan['Total Cost'])
  const crossover = firstGin > 0 ? `The sampled cost crossover lies between ${number(points[firstGin - 1].rows)} and ${number(points[firstGin].rows)} clips. More rows make a sequential scan more expensive; the matching fraction, row width and statistics also affect this choice.`
    : 'Measure several sizes to bracket the crossover. Its location depends on this query and generated data; no production threshold is claimed.'
  const max = Math.max(1, ...points.flatMap(point => [point.seq.Plan['Total Cost'], point.gin.Plan['Total Cost']]))
  const x = (rows: number) => 60 + Math.log(rows / 8) / Math.log(50008 / 8) * 430, y = (cost: number) => 195 - cost / max * 155
  return `<p>Recorded planner costs at this size: sequential ${number(seq)}, GIN ${number(gin)}. ${seq < gin
    ? 'Reading the small table directly costs less than starting the GIN lookup and fetching heap pages.' : 'The GIN lookup avoids enough table scanning to offset its startup and heap-fetch costs.'}
    Costs are PostgreSQL estimates in arbitrary units, not milliseconds. The default planner chose ${escape(chosen.toLowerCase())}. Alternatives use local planner switches; the GIN comparison temporarily removes competing secondary indexes in a transaction, then rolls it back. Handler searches keep every index.</p>
    <p>${escape(crossover)}</p><p class="plan-legend"><span class="plan-seq">Solid: sequential</span> / <span class="plan-gin">Dashed: GIN</span></p>
    <svg class="plan-chart" viewBox="0 0 520 240" role="img" aria-label="Sequential and GIN estimated total cost across measured table sizes. Exact values follow in the table. Row count uses a logarithmic scale; cost uses a linear scale.">
      <path d="M60 30 V195 H490" class="plan-axis" />${[0, max / 2, max].map(cost => `<text x="52" y="${y(cost) + 4}" text-anchor="end">${number(cost)}</text>`).join('')}
      <text x="60" y="18">Estimated total cost</text><text x="60" y="215">8</text><text x="490" y="215" text-anchor="end">50,008 clips (log scale)</text>
      ${(['seq', 'gin'] as const).map(kind => `<polyline points="${points.map(p => `${x(p.rows)},${y(p[kind].Plan['Total Cost'])}`).join(' ')}" class="plan-line plan-${kind}" />${points.map(p => `<circle cx="${x(p.rows)}" cy="${y(p[kind].Plan['Total Cost'])}" r="${p.rows === selected.rows ? 5 : 3}" class="plan-dot plan-${kind}" />`).join('')}`).join('')}
    </svg><table data-plan-samples><caption>${live ? 'Measurements for this search' : 'Recorded measurements'}; total planner cost</caption><thead><tr>${['Clips', 'Sequential', 'GIN', 'Default choice'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${points.map(p => `<tr data-rows="${p.rows}"><td>${number(p.rows)}</td><td>${number(p.seq.Plan['Total Cost'])}</td><td>${number(p.gin.Plan['Total Cost'])}</td><td>${escape(scan(p.natural.Plan) || p.natural.Plan['Node Type'])}</td></tr>`).join('')}</tbody></table>
    ${([['Default plan', selected.natural], ['Sequential alternative', selected.seq], ['GIN alternative', selected.gin]] as const).map(([label, plan]) => `<details><summary>${label}: cost ${number(plan.Plan['Total Cost'])}; execution ${number(plan['Execution Time'])} ms</summary>${pre(json(plan))}</details>`).join('')}
    <p>EXPLAIN ANALYZE executes the captured clip query separately from the handler. Its time is subject to browser clock rounding and is excluded from the Timing tab.${live ? ' Choose another size to add a point; changing the search clears the chart.' : ' These measurements were recorded in Chromium, not in this tab.'}</p>`
}
