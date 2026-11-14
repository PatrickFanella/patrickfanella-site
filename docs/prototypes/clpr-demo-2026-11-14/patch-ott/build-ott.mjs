// Over-the-top prototype pages in the Patrick__Eff "Patch / routed signal" brand.
// Throwaway prototype code; data comes from the same recorded run as the plain prototype.
import fs from 'node:fs'
import { esc, codeLink, diagram, flow, urlHTML, inspector, statusClass, statusText, stepName } from './render.mjs'
import { CASES } from './cases.mjs'

const rec = JSON.parse(fs.readFileSync('recorded.json', 'utf8'))
const day = rec.recordedAt.slice(0, 10)
const n = (x) => Number(x).toLocaleString('en-US')
const main = rec.cases.find((c) => c.id === 'relevance')
const execs = main.statements.filter((s) => s.kind === 'execute')
const plans = Object.entries(rec.plans).map(([r, p]) => ({ rows: +r, ms: parseFloat(p.find((l) => l.startsWith('Execution Time')).split(': ')[1]), index: p.some((l) => /idx_clips_search_vector/.test(l)) })).sort((a, b) => a.rows - b.rows)
const clips = JSON.parse(main.body).results.clips

async function probe(url) {
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); return { status: r.status, body: (await r.text()).trim().slice(0, 120), at } }
  catch (e) { return { status: 'no answer', body: String(e.message), at } }
}
const health = await probe('https://clpr.tv/api/v1/health')
const ready = await probe('https://clpr.tv/health/ready')

const stageTiming = { total: main.ms, trips: main.statements.map((s) => ({ start: s.start, dur: s.dur, kind: s.kind })) }

// Oscilloscope trace of the recorded plans: time against table size.
function scope() {
  const W = 300, H = 120, maxR = plans.at(-1).rows, maxM = Math.max(...plans.map((p) => p.ms)) * 1.15
  const X = (r) => 14 + (r / maxR) * (W - 28), Y = (m) => H - 16 - (m / maxM) * (H - 30)
  const seq = plans.filter((p) => !p.index)
  const grid = [...Array(7)].map((_, i) => `<line x1="${(i * W) / 6}" x2="${(i * W) / 6}" y1="0" y2="${H}"/>`).join('') + [...Array(5)].map((_, i) => `<line y1="${(i * H) / 4}" y2="${(i * H) / 4}" x1="0" x2="${W}"/>`).join('')
  return `<svg class="scope" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(plans.map((p) => `${n(p.rows)} rows ${p.ms} ms ${p.index ? 'index' : 'scan'}`).join(', '))}">
    <g class="grid">${grid}</g>
    <path class="trace" d="${seq.map((p, i) => `${i ? 'L' : 'M'}${X(p.rows)},${Y(p.ms)}`).join(' ')}"/>
    ${plans.map((p) => `<circle class="${p.index ? 'idx' : 'seq'}" cx="${X(p.rows)}" cy="${Y(p.ms)}" r="4"/>`).join('')}
    <text x="${X(plans.at(-2).rows)}" y="${Y(plans.at(-2).ms) - 9}" text-anchor="middle">${plans.at(-2).ms.toFixed(1)}ms SCAN</text>
    <text class="idx-t" x="${X(plans.at(-1).rows) - 4}" y="${Y(plans.at(-1).ms) - 9}" text-anchor="end">${plans.at(-1).ms.toFixed(1)}ms INDEX</text></svg>`
}
// Spectrum meters: one bar per round trip, height from its measured duration.
function meters() {
  const peak = Math.max(...main.statements.map((s) => s.dur))
  return `<div class="meters" aria-hidden="true">${main.statements.map((s) => `<span class="m ${s.kind}" style="--h:${Math.max(10, (s.dur / peak) * 100).toFixed(0)}%"><i></i><b>${s.dur.toFixed(1)}</b></span>`).join('')}</div>`
}

const nav = (current) => `
<a class="skip" href="#main">Skip to the page</a>
<header class="bar">
  <a class="brand" href="index.html"><img src="mark.svg" alt="" width="44" height="44"><span><b>PATRICK__EFF</b><i>Patrick Fanella</i></span></a>
  <nav aria-label="Pages">
    <a href="index.html#work"><span class="jack"></span>Work</a>
    <a href="demo.html"${current === 'demo' ? ' aria-current="page"' : ''}><span class="jack"></span>Clpr demo</a>
    <a href="#"><span class="jack"></span>Résumé</a>
    <a href="https://github.com/PatrickFanella"><span class="jack"></span>GitHub</a>
    <a href="mailto:patrick@subcult.tv"><span class="jack"></span>Contact</a>
  </nav>
</header>`
const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="ott.css"></head><body>`
const foot = `<footer class="foot">
  <p class="identity"><span>SOFTWARE.</span> <span class="pink">SOUND.</span> <span class="green">CULTURE.</span></p>
  <p class="mono">PATRICK__EFF / PATRICKFANELLA.CO / PROTOTYPE, NOT DEPLOYED / NO COOKIES</p>
</footer>`

const home = `${head('Patrick Fanella')}
${nav('home')}
<main id="main" tabindex="-1">
<section class="hero" aria-labelledby="who">
  <canvas id="stage" aria-hidden="true"></canvas>
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="patch-label"><span class="green">PATCH / 01</span> SENIOR BACKEND + FULL-STACK ENGINEER / CHICAGO OR REMOTE</p>
      <h1 id="who"><span>I WRITE THE API.</span><span class="pink">THE INTERFACE.</span><span class="green">AND THE RUNBOOK.</span></h1>
      <p class="lead">At DeliverZero I built inventory, returns and partner integrations that cut manual operations work by about 25%. Now I build and run Go, Python and TypeScript services on PostgreSQL, and I write down what happens when they break.</p>
      <div class="ctas"><a class="btn primary" href="#">Download résumé</a><a class="btn" href="demo.html#live">Run Clpr in your browser</a><span class="avail"><span class="led on"></span>Interviewing now</span></div>
    </div>
    <aside class="module rack" aria-labelledby="mod-h">
      <div class="mod-top"><span class="screw"></span><h2 id="mod-h">CLPR / SEARCH / RECORDED RUN</h2><span class="led on"></span><span class="screw"></span></div>
      <div class="mod-body">
        <p class="mono small">Clpr's real Go route, handler and repository in WebAssembly, against PostgreSQL in WebAssembly.</p>
        ${flow(main)}
        <p class="req"><span class="${statusClass(main.status)}">${esc(statusText(main.status))}</span> <code>${urlHTML(main.url.replace('/api/v1', ''))}</code></p>
        <ol class="results">${clips.slice(0, 2).map((c) => `<li>${esc(c.title)} <span>${esc(c.creator_name)} / ${c.vote_score} votes</span></li>`).join('')}</ol>
        <div class="mod-split">
          <div><p class="mono small">ROUND TRIPS, MS</p>${meters()}</div>
          <div><p class="mono small">PLAN VS TABLE SIZE</p>${scope()}</div>
        </div>
      </div>
      <div class="mod-foot"><span>${execs.length} STATEMENTS / ${main.statements.length} ROUND TRIPS / ${main.ms} MS / ${n(main.rows)} ROWS</span><span>${esc(rec.engine.toUpperCase())} / ${day}</span></div>
    </aside>
  </div>
  <p class="stage-note mono">Cables replay the recorded round trips, slowed down. Spectrum = measured durations.</p>
</section>

<section class="channel" aria-labelledby="facts-h">
  <p class="patch-label"><span class="pink">PATCH / 02</span> <span id="facts-h">SIGNAL CHECK</span></p>
  <div class="readouts">
    <div class="readout"><b>155</b><span>Clpr schema migrations, applied in order from the first, in a browser in ${(rec.boot.phases.Migrations / 1000).toFixed(1)} s</span></div>
    <div class="readout"><b>${n(plans.at(-1).rows)}</b><span>rows before PostgreSQL switched this search to the full-text index</span></div>
    <div class="readout"><b>${main.statements.length}</b><span>wire-protocol round trips per search, every byte decoded on the demo page</span></div>
  </div>
</section>

<section class="channel" id="work" aria-labelledby="work-h">
  <p class="patch-label"><span class="green">PATCH / 03</span> <span id="work-h">SELECTED WORK</span> <a href="#">ALL 25 PROJECTS</a></p>
  <div class="modules">
    ${[
      ['purple', 'CLPR', 'Twitch clip discovery in production.', 'Creator and topic search, playlists and moderation. I built and operate the Go API, the React client and the search pipeline.', 'clpr.tv', 'https://clpr.tv', 'Run its search code', 'demo.html', 'GO / POSTGRESQL / OPENSEARCH'],
      ['pink', 'HASANARA', 'Search a broadcast archive by transcript, chapter and moment.', 'React frontend on Rekolekt, my Python and FastAPI ingestion, transcription and passage search.', 'hasanara.tv', 'https://hasanara.tv', 'Case study', '#', 'PYTHON / FASTAPI / WHISPER'],
      ['green', 'UNDERTOW', 'Music videos rendered to MP4 in the browser. No server.', 'Layered WebGL visuals, timed lyrics, six templates, a WebCodecs render pipeline.', 'undertow.subcult.tv', 'https://undertow.subcult.tv', 'Case study', '#', 'TYPESCRIPT / REACT / WEBCODECS'],
    ].map(([c, name, out, what, dom, href, l, lh, stack]) => `<article class="module card ${c}"><span class="plug"></span><div class="mod-top"><span class="screw"></span><h3>${name}</h3><span class="led on"></span><span class="screw"></span></div><div class="mod-body"><p class="out">${out}</p><p class="what">${what}</p><p class="links"><a href="${lh}">${l}</a> <a href="${href}">${dom}</a></p></div><div class="mod-foot"><span>${stack}</span></div></article>`).join('')}
  </div>
</section>

<section class="channel" aria-labelledby="ops-h">
  <p class="patch-label"><span class="pink">PATCH / 04</span> OPERATING CLPR / 2026-11-13 / <span class="draft">DRAFT, PENDING OWNER REVIEW</span></p>
  <div class="module incident">
    <div class="mod-top"><span class="screw"></span><h2 id="ops-h">SIGNAL LOST, NOBODY NOTICED</h2><span class="led warn"></span><span class="screw"></span></div>
    <div class="mod-body incident-body">
      <div>
        <p class="big">Search ran on its fallback for a day while every health check said healthy.</p>
        <p>Clpr's backend could not reach OpenSearch when it started, so it served search from PostgreSQL. Readiness only pings OpenSearch when a client exists, and the failed startup left none.</p>
        <dl class="verdict"><div><dt>FINDING</dt><dd>A dependency that fails at startup is dropped for good, and readiness stops checking it.</dd></div><div><dt>CHANGE</dt><dd>Retry after startup; report the active search backend in readiness. Proposed, not filed or fixed yet.</dd></div></dl>
      </div>
      <pre class="term"><span class="dim">$ docker logs clpr-backend  # 2026-11-13</span>
<span class="warn">WARNING: OpenSearch ping failed: connection refused</span>
Search features will use PostgreSQL FTS fallback

<span class="dim">$ curl clpr.tv/api/v1/health   # ${esc(health.at)}</span>
<span class="ok">${esc(String(health.status))}</span> ${esc(health.body)}
<span class="dim">$ curl clpr.tv/health/ready</span>
<span class="ok">${esc(String(ready.status))}</span> ${esc(ready.body)}</pre>
    </div>
  </div>
</section>
</main>
${foot}
<script>window.STAGE_TIMING=${JSON.stringify(stageTiming)}</script>
<script src="stage.js"></script>
</body></html>`
fs.writeFileSync('index.html', home)

// Demo page: the full inspector in rack chrome.
const ctx = { plans: rec.plans }
const labelled = rec.cases.map((c, i) => ({ ...c, label: CASES[i].label, simulated: CASES[i].simulated }))
const params = (u) => u.replace(/^[^?]*\?/, '')
const casesList = labelled.map((c, i) => `<li><button type="button" data-case="${c.id}" aria-pressed="${i === 0}"><span class="led ${c.status < 300 ? 'on' : c.status < 500 ? 'warn' : 'bad'}"></span><span class="case-top">${esc(c.label)}<span class="code-status">${c.status}</span></span>${c.simulated ? '<span class="badge">SIMULATED FAULT</span>' : ''}<span class="code">${urlHTML(params(c.url))}</span></button></li>`).join('')
const caseOptions = labelled.map((c) => `<option value="${c.id}">${esc(c.label)} (${c.status})</option>`).join('')
const demo = `${head('Clpr search in your browser')}
${nav('demo')}
<main id="main" tabindex="-1">
<section class="demo-hero">
  <canvas id="stage" aria-hidden="true"></canvas>
  <div class="demo-hero-inner">
    <div>
      <p class="patch-label"><span class="green">PATCH / CLPR</span> REAL GO CODE / POSTGRESQL / YOUR BROWSER</p>
      <h1><span>CLPR SEARCH.</span><span class="pink">IN YOUR BROWSER.</span><span class="green">EVERY BYTE.</span></h1>
      <p class="lead"><a href="https://clpr.tv">Clpr</a> is the Twitch clip search I built and run. Its real search code answers requests against PostgreSQL, both running in this tab, and shows every statement, message and plan.</p>
      <details class="how"><summary>How it works</summary><p>Gin route, handler and repository at Clpr commit aa41764, compiled to WebAssembly. pgx talks to PostgreSQL 18.6 (PGlite) through a 40-line <code>net.Conn</code>, which is how every message is captured. 155 migrations run first. Recorded in ${esc(rec.engine.replace('/', ' '))} on ${day}.</p></details>
    </div>
    <div class="module live-mod" id="live" aria-live="polite">
      <div class="mod-top"><span class="screw"></span><h2>LIVE MODE</h2><span class="led" id="live-led"></span><span class="screw"></span></div>
      <div class="mod-body">
        <p class="state" id="mode-state">Showing the recorded run.</p>
        <p class="cost" id="mode-cost">Patch the real code into your tab: send your own queries and grow the table to watch the plan change. About 14.5 MB and 500 MB of memory; desktop browsers.</p>
        <details class="cost-more"><summary>Start-up measurements</summary><p>PostgreSQL ${(rec.boot.phases.PostgreSQL / 1000).toFixed(1)} s, ${rec.boot.migrations} migrations ${(rec.boot.phases.Migrations / 1000).toFixed(1)} s, Go ${(rec.boot.phases.Go / 1000).toFixed(2)} s, after the download.</p></details>
        <p class="state" id="mode-table" hidden></p>
        <div class="mode-actions"><button class="btn primary" type="button" id="go-live" hidden>Patch in live</button><button class="btn" type="button" id="stop-live" hidden>Unplug</button></div>
        <div class="progress" id="progress" hidden><span></span></div>
      </div>
    </div>
  </div>
</section>
<div class="workbench">
  <div class="rail module">
    <div class="mod-top"><span class="screw"></span><h2>REQUESTS</h2><span class="screw"></span></div>
    <label class="case-select"><span>Request</span><select id="case-select">${caseOptions}</select></label>
    <ul class="cases" aria-label="Scripted requests">${casesList}</ul>
  </div>
  <section class="inspector module" aria-labelledby="case-title">
    <div class="mod-top"><span class="screw"></span><h2>INSPECTOR</h2><span class="led on"></span><span class="screw"></span></div>
    <div class="mod-body">
      <p class="recorded-note" id="recorded-note">Recorded at ${n(main.rows)} rows (8 fixture, ${n(main.rows - 8)} synthetic). <a href="#live">Patch in live</a> to send your own queries.</p>
      <form class="query-bar" id="query-bar" hidden>
        <label>Query <input name="q" value="world record" autocomplete="off"></label>
        <label>Type <select name="type"><option>clips</option><option>all</option><option>creators</option><option>tags</option></select></label>
        <label>Sort <select name="sort"><option>relevance</option><option>recent</option><option>popular</option></select></label>
        <label>Limit <input name="limit" value="20" inputmode="numeric" size="4"></label>
        <button class="btn primary" type="submit">Send</button>
        <fieldset class="dataset"><legend>Rows in the table</legend>
          <label><input type="radio" name="dataset" value="0" checked> 8 fixture</label>
          <label><input type="radio" name="dataset" value="10000"> 10,008</label>
          <label><input type="radio" name="dataset" value="50000"> 50,008</label>
        </fieldset>
      </form>
      <div id="inspector">${inspector(labelled[0], 'recorded', ctx)}</div>
    </div>
  </section>
</div>
</main>
${foot}
<script>window.STAGE_TIMING=${JSON.stringify(stageTiming)};window.RECORDED=${JSON.stringify({ ...rec, cases: labelled }).replace(/</g, '\\u003c')};</script>
<script src="stage.js"></script>
<script type="module" src="demo.js"></script>
</body></html>`
fs.writeFileSync('demo.html', demo)
console.log('built ott', health.status, ready.status)
