// Spike (prototype a): writes one static HTML page per project, plus /projects/, from the
// portfolio catalog. Vite then builds them like any other page. No dependencies.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { projects } = JSON.parse(readFileSync(join(root, 'content/portfolio.json'), 'utf8'))
const out = join(root, 'projects')

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const words = (t) => t.split(/\s+/).map((w) => `<span data-word>${esc(w)}</span>`).join(' ')
const list = (items = []) => items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''

const shell = ({ title, description, body, current }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="color-scheme" content="light dark">
  <noscript><style>[data-pour-in] [data-word] { visibility: visible !important; animation: none !important; }</style></noscript>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body class="project-page">
  <canvas id="ink" aria-hidden="true"></canvas>
  <a class="skip" href="#main">Skip to the content</a>
  <header class="bar">
    <a class="mark is-name" href="/" data-bleed="y">patrickfanella.co</a>
    <nav aria-label="Main">
      <a href="/projects/"${current ? ' aria-current="page"' : ''} data-bleed="c">Projects</a>
      <a href="/motion/" data-bleed="o">Motion</a>
      <a href="https://github.com/PatrickFanella" data-bleed="y">GitHub</a>
      <button type="button" class="switch" data-theme-switch data-splash="y" aria-pressed="false" aria-label="Dark theme"><i aria-hidden="true"></i><span>Light</span></button>
    </nav>
  </header>
${body}
  <footer class="foot">
    <p>Patrick Fanella. Software, sound, culture.</p>
    <nav aria-label="Contact">
      <a href="mailto:patrick@subcult.tv" data-bleed="y">patrick@subcult.tv</a>
      <a href="https://github.com/PatrickFanella" data-bleed="c">GitHub</a>
      <a href="https://linkedin.com/in/patrick-fanella" data-bleed="o">LinkedIn</a>
    </nav>
  </footer>
  <script type="module" src="/src/project-page.ts"></script>
</body>
</html>
`

const page = (p) => shell({
  title: `${p.title}, Patrick Fanella`,
  description: p.summary,
  body: `  <main id="main" class="project">
    <div class="project-head panel">
      <p class="meta">${esc([p.category, p.periodLabel, p.deliveryStatus].filter(Boolean).join(' · '))}</p>
      <h1 class="title" data-pour-in style="view-transition-name: p-${p.slug}"><span data-fit>${words(p.title)}</span></h1>
      <p>${esc(p.summary)}</p>
      <ul class="stack" aria-label="Stack">${(p.stack ?? []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="actions">
        ${p.liveUrl ? `<a class="btn primary" href="${esc(p.liveUrl)}" data-bleed="o" data-splash="o">Open it</a>` : ''}
        ${p.repoUrl ? `<a class="btn" href="${esc(p.repoUrl)}" data-bleed="c" data-splash="c">Source</a>` : ''}
      </div>
    </div>
    <div class="body">
      ${p.problem ? `<section class="panel" data-rise><h2>The problem</h2><p>${esc(p.problem)}</p></section>` : ''}
      <section class="panel" data-rise><h2>What I built</h2><p>${esc(p.description)}</p>${list(p.highlights)}</section>
      ${p.architecture?.length ? `<section class="panel" data-rise><h2>How it's built</h2>${p.architecture.map((a) => `<p>${esc(a)}</p>`).join('')}</section>` : ''}
      ${p.lessons?.length ? `<details data-unfold class="panel" data-rise><summary data-bleed="y">What I learned</summary>${list(p.lessons)}</details>` : ''}
    </div>
  </main>`,
})

const index = () => shell({
  title: 'Projects, Patrick Fanella',
  description: `${projects.length} projects by Patrick Fanella, each with what it is, how it's built and how far along it is.`,
  current: true,
  body: `  <main id="main" class="project">
    <div class="project-head panel">
      <h1 class="title" data-pour-in><span data-fit>${words('Projects')}</span></h1>
      <p>${projects.length} projects, each with what it is, how it's built and how far along it is.</p>
    </div>
    <ul class="cards">
${projects.map((p) => `      <li><a class="panel" href="/projects/${p.slug}/" data-bleed="c"><b style="view-transition-name: p-${p.slug}">${esc(p.title)}</b><span>${esc(p.summary)}</span></a></li>`).join('\n')}
    </ul>
  </main>`,
})

rmSync(out, { recursive: true, force: true })
for (const p of projects) {
  mkdirSync(join(out, p.slug), { recursive: true })
  writeFileSync(join(out, p.slug, 'index.html'), page(p))
}
writeFileSync(join(out, 'index.html'), index())
console.log(`wrote ${projects.length + 1} pages to projects/`)
