import type { ClprEvent } from '../clpr-protocol'
import type { PlanNode, PlanSample } from './plans'

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })
const scan = (node: PlanNode): string => node['Index Name'] === 'idx_clips_search_vector' ? 'GIN bitmap scan'
  : node['Node Type'] === 'Seq Scan' ? 'Sequential scan' : (node.Plans ?? []).map(scan).find(Boolean)
    ?? (node['Node Type'].includes('Scan') ? `${node['Node Type']}${node['Index Name'] ? ` on ${node['Index Name']}` : ''}` : '')

export function startPlanView(root: HTMLElement, resize: (rows: number) => Promise<unknown>) {
  const form = root.querySelector<HTMLFormElement>('[data-plan-size]')!
  const select = form.querySelector<HTMLSelectElement>('select')!
  const button = form.querySelector<HTMLButtonElement>('button')!
  const status = root.querySelector<HTMLElement>('[data-plan-status]')!
  const output = root.querySelector<HTMLElement>('[data-plan-output]')!
  const samples = new Map<number, PlanSample>()
  let url = '', generation = 0
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const current = ++generation
    button.disabled = true; select.disabled = true; form.setAttribute('aria-busy', 'true')
    status.textContent = 'Resizing generated clips, running VACUUM FULL and ANALYZE, then searching and comparing plans. Stop live mode cancels this work.'
    try { await resize(Number(select.value)) }
    catch (error) { if (current === generation) status.textContent = String(error) }
    finally {
      if (current === generation) { button.disabled = false; select.disabled = false; form.removeAttribute('aria-busy') }
    }
  })
  return {
    clear() {
      generation++; url = ''; samples.clear(); output.replaceChildren()
      button.disabled = false; select.disabled = false; form.removeAttribute('aria-busy')
    },
    render(event: Extract<ClprEvent, { ev: 'result' }>) {
      if (url !== event.url) { samples.clear(); url = event.url }
      select.value = String(event.rows)
      output.replaceChildren()
      if (!event.plan) {
        status.textContent = event.planError ? `Plan comparison unavailable: ${event.planError}` : 'This response sent no clip-ranking query to explain.'
        return
      }
      samples.set(event.rows, event.plan)
      const points = [...samples.values()].sort((a, b) => a.rows - b.rows)
      const sample = event.plan, chosen = scan(sample.natural.Plan) || sample.natural.Plan['Node Type']
      status.textContent = `${number(event.rows)} clips: ${chosen}. Plans measured in this tab after ANALYZE; eight fixtures plus ${number(event.rows - 8)} generated clips. The selected size re-runs the handler too.`
      const explanation = document.createElement('p')
      const seq = sample.seq.Plan['Total Cost'], gin = sample.gin.Plan['Total Cost']
      explanation.textContent = `Recorded planner costs at this size: sequential ${number(seq)}, GIN ${number(gin)}. ${seq < gin
        ? 'Reading the small table directly costs less than starting the GIN lookup and fetching heap pages.'
        : 'The GIN lookup avoids enough table scanning to offset its startup and heap-fetch costs.'} Costs are PostgreSQL estimates in arbitrary units, not milliseconds. The default planner chose ${chosen.toLowerCase()}. Alternatives use local planner switches; the GIN comparison temporarily removes competing secondary indexes in a transaction, then rolls it back. Handler searches keep every index.`
      const crossover = document.createElement('p')
      const firstGin = points.findIndex(point => point.gin.Plan['Total Cost'] < point.seq.Plan['Total Cost'])
      crossover.textContent = firstGin > 0 ? `The sampled cost crossover lies between ${number(points[firstGin - 1].rows)} and ${number(points[firstGin].rows)} clips. More rows make a sequential scan more expensive; the matching fraction, row width and statistics also affect this choice.`
        : 'Measure several sizes to bracket the crossover. Its location depends on this query and generated data; no production threshold is claimed.'
      const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      chart.setAttribute('viewBox', '0 0 520 240'); chart.setAttribute('role', 'img')
      chart.setAttribute('aria-label', 'Sequential and GIN estimated total cost across measured table sizes. Exact values follow in the table. Row count uses a logarithmic scale; cost uses a linear scale.')
      chart.classList.add('plan-chart')
      const svg = (tag: string, attrs: Record<string, string>, text?: string) => {
        const element = document.createElementNS(chart.namespaceURI, tag)
        Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value))
        if (text !== undefined) element.textContent = text
        chart.append(element)
      }
      const max = Math.max(1, ...points.flatMap(point => [point.seq.Plan['Total Cost'], point.gin.Plan['Total Cost']]))
      const x = (rows: number) => 60 + Math.log(rows / 8) / Math.log(50008 / 8) * 430
      const y = (cost: number) => 195 - cost / max * 155
      svg('path', { d: 'M60 30 V195 H490', class: 'plan-axis' })
      for (const cost of [0, max / 2, max]) {
        svg('text', { x: '52', y: String(y(cost) + 4), 'text-anchor': 'end' }, number(cost))
      }
      svg('text', { x: '60', y: '18' }, 'Estimated total cost')
      svg('text', { x: '60', y: '215' }, '8')
      svg('text', { x: '490', y: '215', 'text-anchor': 'end' }, '50,008 clips (log scale)')
      for (const kind of ['seq', 'gin'] as const) {
        svg('polyline', { points: points.map(point => `${x(point.rows)},${y(point[kind].Plan['Total Cost'])}`).join(' '), class: `plan-line plan-${kind}` })
        points.forEach(point => svg('circle', { cx: String(x(point.rows)), cy: String(y(point[kind].Plan['Total Cost'])), r: point.rows === event.rows ? '5' : '3', class: `plan-dot plan-${kind}` }))
      }
      const legend = document.createElement('p'); legend.className = 'plan-legend'
      const sequential = document.createElement('span'), indexed = document.createElement('span')
      sequential.className = 'plan-seq'; sequential.textContent = 'Solid: sequential'
      indexed.className = 'plan-gin'; indexed.textContent = 'Dashed: GIN'
      legend.append(sequential, ' / ', indexed)
      const table = document.createElement('table'); table.dataset.planSamples = ''
      const caption = table.createCaption(); caption.textContent = 'Measurements for this search; total planner cost'
      const head = table.createTHead().insertRow()
      for (const label of ['Clips', 'Sequential', 'GIN', 'Default choice']) {
        const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th)
      }
      const body = table.createTBody()
      for (const point of points) {
        const row = body.insertRow(); row.dataset.rows = String(point.rows)
        for (const value of [number(point.rows), number(point.seq.Plan['Total Cost']), number(point.gin.Plan['Total Cost']), scan(point.natural.Plan) || point.natural.Plan['Node Type']]) row.insertCell().textContent = value
      }
      output.append(explanation, crossover, legend, chart, table)
      for (const [label, plan] of [['Default plan', sample.natural], ['Sequential alternative', sample.seq], ['GIN alternative', sample.gin]] as const) {
        const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre')
        summary.textContent = `${label}: cost ${number(plan.Plan['Total Cost'])}; execution ${number(plan['Execution Time'])} ms`
        pre.textContent = JSON.stringify(plan, null, 2); pre.tabIndex = 0
        details.append(summary, pre); output.append(details)
      }
      const note = document.createElement('p')
      note.textContent = 'EXPLAIN ANALYZE executes the captured clip query separately from the handler. Its time is subject to browser clock rounding and is excluded from the Timing tab. Choose another size to add a point; changing the search clears the chart.'
      output.append(note)
    },
  }
}
