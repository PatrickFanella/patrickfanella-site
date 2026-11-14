// Builds the two prototype pages from recorded.json and a timestamped check of Clpr's public
// health endpoints. Throwaway prototype code.
import fs from 'node:fs'
import { esc, codeLink, diagram, flow, urlHTML, inspector, statusClass, statusText } from './render.mjs'
import { CASES } from './cases.mjs'

const rec = JSON.parse(fs.readFileSync('recorded.json', 'utf8'))
const day = rec.recordedAt.slice(0, 10)
const n = (x) => Number(x).toLocaleString('en-US')
const main = rec.cases.find((c) => c.id === 'relevance')
const execs = main.statements.filter((s) => s.kind === 'execute').length
const scanLine = (p) => p.find((l) => /Index Scan|Seq Scan/.test(l)).trim().replace(/^->\s*/, '').replace(/\s*\((cost|actual).*$/, '')
const execTime = (p) => p.find((l) => l.startsWith('Execution Time')).replace('Execution Time: ', '')

// Public production evidence, fetched now and dated.
async function probe(url) {
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); return { url, status: r.status, body: (await r.text()).trim().slice(0, 120), at } }
  catch (e) { return { url, status: 'no answer', body: String(e.message), at } }
}
const health = await probe('https://clpr.tv/api/v1/health')
const ready = await probe('https://clpr.tv/health/ready')

const masthead = (current) => `
<a class="skip" href="#main">Skip to the page</a>
<header class="masthead">
  <div class="masthead-top"><a class="name" href="index.html">Patrick Fanella</a><button class="theme" type="button" data-theme-toggle title="Switch between light and dark theme">Theme</button></div>
  <nav aria-label="Pages">
    <a href="index.html#work">Work</a>
    <a href="demo.html"${current === 'demo' ? ' aria-current="page"' : ''}>Clpr demo</a>
    <a href="#">Résumé</a>
    <a href="https://github.com/PatrickFanella">GitHub</a>
    <a href="mailto:patrick@subcult.tv">Contact</a>
  </nav>
</header>`
const themeScript = `<script>
(function(){var k='theme';try{var t=localStorage.getItem(k);if(t)document.documentElement.dataset.theme=t}catch(e){}
function isDark(){var r=document.documentElement;return r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches}
function label(){var b=document.querySelector('[data-theme-toggle]');if(b){b.textContent=isDark()?'Light theme':'Dark theme';b.setAttribute('aria-pressed',String(isDark()))}}
document.addEventListener('DOMContentLoaded',label);
document.addEventListener('click',function(e){if(!e.target.closest('[data-theme-toggle]'))return;var r=document.documentElement;
r.dataset.theme=isDark()?'light':'dark';try{localStorage.setItem(k,r.dataset.theme)}catch(e){}label()})})();
</script>`
const head = (title, desc) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="stylesheet" href="styles.css">${themeScript}</head><body>`
const colophon = `<footer class="colophon">
  <p>Prototype, not deployed. A release build will name its commit and CI run, with a command to verify its signature.</p>
  <p>Fonts are IBM Plex, served from this site. No cookies and no trackers.</p>
</footer>`
// Production search latency, measured now from this machine, sequentially and gently.
async function latency(url, count) {
  const times = []; let ok = 0
  for (let i = 0; i < count; i++) {
    const s = performance.now()
    try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); await r.text(); if (r.ok) ok++ } catch {}
    times.push(performance.now() - s); await new Promise((r) => setTimeout(r, 250))
  }
  times.sort((a, b) => a - b)
  return { n: count, ok, median: Math.round(times[Math.floor(count / 2)]), max: Math.round(times.at(-1)), at: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' }
}
const searchProbe = await latency('https://clpr.tv' + main.url, 20)

const heroResults = JSON.parse(main.body).results.clips.slice(0, 2).map((r) => `<li>${esc(r.title)} <span class="muted">${esc(r.creator_name)}, ${r.vote_score} votes</span></li>`).join('')
const planKeys = Object.keys(rec.plans).sort((a, b) => a - b)
const planReceipt = [planKeys[0], planKeys.at(-2), planKeys.at(-1)].map((k) => `<tr><th scope="row">${n(k)} rows</th><td>${esc(scanLine(rec.plans[k]).replace(/ on clips c$/, ''))}</td><td class="nowrap">${esc(execTime(rec.plans[k]))}</td></tr>`).join('')

const home = `${head('Patrick Fanella: senior backend and full-stack engineer', 'Senior backend and full-stack engineer in Chicago. Go, Python and TypeScript services on PostgreSQL, built and run in production.')}
${masthead('home')}
<main id="main" tabindex="-1">
  <section class="intro" aria-labelledby="who">
    <div>
      <p class="role">Senior backend and full-stack engineer in Chicago</p>
      <h1 id="who">I build backend systems, run them in production, and write down what happens when they break.</h1>
      <p class="lead">At DeliverZero I built inventory, returns and partner integrations that cut manual operations work by about 25%.</p>
      <p class="sub-lead">I work in Go, Python and TypeScript on PostgreSQL, and I operate what I ship. Interviewing now for senior backend and full-stack roles, in Chicago or remote.</p>
      <div class="actions"><a class="button" href="#">Download my résumé (PDF)</a><a href="mailto:patrick@subcult.tv">patrick@subcult.tv</a><a href="https://github.com/PatrickFanella">GitHub</a></div>
    </div>
    <aside class="hero-demo" aria-labelledby="hero-demo-h">
      <h2 id="hero-demo-h">Clpr's search code, running in a browser</h2>
      <p class="muted">The real Go route, handler and repository from <a href="https://clpr.tv">clpr.tv</a>, compiled to WebAssembly, querying PostgreSQL that also runs in the browser.</p>
      <div class="hero-diagram">${diagram(main, { compact: true })}</div>${flow(main)}
      <p class="hero-run"><span class="${statusClass(main.status)}">${esc(statusText(main.status))}</span> <code>${urlHTML(main.url.replace('/api/v1', ''))}</code></p>
      <ol class="hero-results">${heroResults}</ol>
      <table class="plan-receipt"><caption>The same query as the table grows: PostgreSQL switches to the full-text index somewhere between ${n(planKeys.at(-2))} and ${n(planKeys.at(-1))} rows</caption><tbody>${planReceipt}</tbody></table>
      <p class="meta">Recorded ${day} in ${esc(rec.engine.replace('/', ' '))}. Fixture and synthetic rows.</p>
      <div class="actions"><a class="button secondary" href="demo.html#live">Run it live on the demo page</a></div>
    </aside>
  </section>

  <ul class="facts" aria-label="Facts with sources">
    <li><span>Spot check: production Clpr search answered ${searchProbe.ok} of ${searchProbe.n} requests, median ${searchProbe.median} ms</span><span class="source">clpr.tv, ${searchProbe.n} sequential requests from one machine in Chicago, ${esc(searchProbe.at)}. Not an SLO measurement.</span></li>
    <li><span>${rec.boot.migrations} schema migrations, still applied in order from the first</span><span class="source">Clpr at aa41764, applied in a browser for <a href="demo.html">the demo</a> in ${(rec.boot.phases.Migrations / 1000).toFixed(1)} s</span></li>
  </ul>

  <section class="record" id="work" aria-labelledby="work-h">
    <div class="margin"><dl><div><dt id="work-h">Selected work</dt><dd>3 of 25 projects</dd></div><div><dd><a href="#">All projects</a></dd></div></dl></div>
    <ul class="work">
      <li><div><h3>Clpr</h3><p class="outcome-line">Twitch clip discovery in production, with creator and topic search, playlists and moderation.</p><p class="what">I built and operate the Go API, the React client and the search pipeline.</p><p class="proof"><a href="demo.html">Run its search code in your browser</a></p></div><div class="side"><a href="https://clpr.tv">clpr.tv</a><span>In production</span><span>Go, PostgreSQL, OpenSearch, React</span></div></li>
      <li><div><h3>HasanAra</h3><p class="outcome-line">Search across a broadcast archive's transcripts, chapters, tags and moments.</p><p class="what">A React frontend on Rekolekt, my Python and FastAPI services for ingestion, transcription and passage search.</p><p class="proof"><a href="#">Read the case study</a></p></div><div class="side"><a href="https://hasanara.tv">hasanara.tv</a><span>In production</span><span>Python, FastAPI, Whisper, PostgreSQL</span></div></li>
      <li><div><h3>Undertow</h3><p class="outcome-line">A music-video editor that exports H.264 MP4 in the browser, with no server.</p><p class="what">Layered WebGL visuals, timed lyrics, six templates, and a WebCodecs render pipeline.</p><p class="proof"><a href="#">Read the case study</a></p></div><div class="side"><a href="https://undertow.subcult.tv">undertow.subcult.tv</a><span>Live beta</span><span>TypeScript, React, WebCodecs</span></div></li>
    </ul>
  </section>

  <section class="record outcome" aria-labelledby="ops-h">
    <div class="margin"><dl>
      <div><dt>Operating Clpr</dt><dd>2026-11-13</dd></div>
      <div><dt>Sources</dt><dd>Startup log, public health endpoints</dd></div>
      <div><dt>Publication</dt><dd class="draft">Draft, pending owner review</dd></div>
    </dl></div>
    <div>
      <h2 id="ops-h">Search ran on its fallback for a day while every health check said healthy.</h2>
      <p class="body">Clpr's backend could not reach OpenSearch when it started, so it served search from its PostgreSQL fallback. The health checks kept passing, because readiness only pings OpenSearch when a client exists.</p>
      <dl class="verdict">
        <div><dt>Finding</dt><dd>A dependency that fails at startup is dropped for good, and readiness stops checking it.</dd></div>
        <div><dt>Proposed change</dt><dd>Retry OpenSearch after startup, and report the active search backend in readiness so a monitor can alert.</dd></div>
        <div><dt>Status</dt><dd>Proposed. Not filed or fixed yet.</dd></div>
      </dl>
      <details class="more"><summary>Evidence: the startup log, the health endpoints and the code</summary>
      <div class="evidence">
        <div><p class="ev-h">Startup log, 2026-11-13</p><pre>WARNING: OpenSearch ping failed: connection refused
Search features will use PostgreSQL FTS fallback</pre></div>
        <div><p class="ev-h">Public endpoints, checked ${esc(health.at)}</p><pre>GET /api/v1/health  <span class="${statusClass(health.status)}">${esc(String(health.status))}</span>
  ${esc(health.body)}
GET /health/ready   <span class="${statusClass(ready.status)}">${esc(String(ready.status))}</span>
  ${esc(ready.body)}</pre></div>
      </div>
      <dl class="findings">
        <div><dt>Why the checks missed it</dt><dd>${codeLink('cmd/api/routes_public.go', 78, 'The readiness check')} skips OpenSearch when the client is unset, and a failed startup ping leaves it unset (${codeLink('cmd/api/infrastructure.go', 64, 'infrastructure.go:64')}).</dd></div>
        <div><dt>The other half</dt><dd>If OpenSearch fails after startup, hybrid search returns 503 with no fallback. Clpr fails open at startup and closed later. <a href="demo.html#hybrid-down">See it in the demo</a>.</dd></div>
      </dl></details>
    </div>
  </section>
</main>
${colophon}
</body></html>`
fs.writeFileSync('index.html', home)

const ctx = { plans: rec.plans, probe: searchProbe }
const labelled = rec.cases.map((c, i) => ({ ...c, label: CASES[i].label, simulated: CASES[i].simulated }))
const params = (u) => u.replace(/^[^?]*\?/, '')
const casesList = labelled.map((c, i) => `<li><button type="button" data-case="${c.id}" aria-pressed="${i === 0}"><span class="case-top">${esc(c.label)}<span class="code-status ${statusClass(c.status)}">${c.status}</span></span>${c.simulated ? '<span class="badge">Simulated fault</span>' : ''}<span class="code">${urlHTML(params(c.url))}</span></button></li>`).join('')
const caseOptions = labelled.map((c) => `<option value="${c.id}">${esc(c.label)} (${c.status})</option>`).join('')
const bootS = ((rec.boot.phases.PostgreSQL + rec.boot.phases.Migrations + rec.boot.phases.Go) / 1000).toFixed(1)
const demo = `${head('Clpr search in your browser: Patrick Fanella', 'Clpr’s real Go search code compiled to WebAssembly, with every SQL statement, timing and query plan shown.')}
${masthead('demo')}
<main id="main" tabindex="-1">
  <section class="demo-head">
    <div>
      <h1>Clpr search, running in your browser</h1>
      <p class="lede"><a href="https://clpr.tv">Clpr</a> is the Twitch clip search I built and run. Below, its real Go search code answers requests against PostgreSQL, both running in a browser, and shows every statement, message and plan.</p>
      <details class="how"><summary>How it works</summary><p>Clpr's Gin route, handler and repository at commit aa41764 are compiled to WebAssembly. pgx talks to PostgreSQL 18.6 compiled to WebAssembly (PGlite) through a 40-line <code>net.Conn</code> that hands over its wire-protocol bytes, which is how every message is captured. Clpr's 155 migrations run first. This page opens on a run recorded in ${esc(rec.engine.replace('/', ' '))} on ${day}.</p></details>
    </div>
    <div class="mode" id="live" aria-live="polite">
      <p class="state" id="mode-state">Showing the recorded run.</p>
      <p class="cost" id="mode-cost"><strong>Live mode</strong> runs the same code in your tab: send your own queries and grow the table to watch the plan change. About 14.5 MB to download and 500 MB of memory; meant for desktop browsers.</p>
      <details class="cost-more"><summary>Start-up measurements</summary><p>Starts in about ${bootS} s once downloaded, measured in ${esc(rec.engine.replace('/', ' '))} on a desktop: PostgreSQL ${(rec.boot.phases.PostgreSQL / 1000).toFixed(1)} s, ${rec.boot.migrations} migrations ${(rec.boot.phases.Migrations / 1000).toFixed(1)} s, Go ${(rec.boot.phases.Go / 1000).toFixed(2)} s. It starts with 8 fixture rows.</p></details>
      <p class="state" id="mode-table" hidden></p>
      <div class="mode-actions"><button class="button" type="button" id="go-live" hidden>Run it live</button><button class="button secondary" type="button" id="stop-live" hidden>Stop live mode</button></div>
      <noscript><p class="cost">Live mode needs JavaScript. The recorded run below is complete without it.</p></noscript>
      <div class="progress" id="progress" hidden><span></span></div>
    </div>
  </section>
  <div class="workbench">
    <div class="rail">
      <label class="case-select"><span>Request</span><select id="case-select">${caseOptions}</select></label>
      <ul class="cases" aria-label="Scripted requests">${casesList}</ul>
    </div>
    <section class="inspector" aria-labelledby="case-title">
      <p class="recorded-note" id="recorded-note">Recorded at ${n(main.rows)} rows (8 fixture, ${n(main.rows - 8)} synthetic). <a href="#live">Run it live</a> to send your own queries and change the table size.</p>
      <form class="query-bar" id="query-bar" hidden>
        <label>Query <input name="q" value="world record" autocomplete="off"></label>
        <label>Type <select name="type"><option>clips</option><option>all</option><option>creators</option><option>tags</option></select></label>
        <label>Sort <select name="sort"><option>relevance</option><option>recent</option><option>popular</option></select></label>
        <label>Limit <input name="limit" value="20" inputmode="numeric" size="4"></label>
        <button class="button" type="submit">Send</button>
        <fieldset class="dataset"><legend>Rows in the table</legend>
          <label><input type="radio" name="dataset" value="0" checked> 8 fixture</label>
          <label><input type="radio" name="dataset" value="10000"> 10,008 (about 2 s)</label>
          <label><input type="radio" name="dataset" value="50000"> 50,008 (about 10 s)</label>
        </fieldset>
      </form>
      <div id="inspector">${inspector(labelled[0], 'recorded', ctx)}</div>
    </section>
  </div>
</main>
${colophon}
<script>window.RECORDED=${JSON.stringify({ ...rec, cases: labelled, probe: searchProbe }).replace(/</g, '\\u003c')};</script>
<script type="module" src="demo.js"></script>
</body></html>`
fs.writeFileSync('demo.html', demo)
console.log('built', health.status, ready.status, ready.body)
