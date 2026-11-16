import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const output = 'public/assets/patrick_fanella_resume.pdf'
const receipt = 'src/content/resume-artifact.json'
const paths = ['src/content/resume.json', 'src/content/contact.ts', 'scripts/render-resume.mjs',
  'public/assets/brand/patrick/pf-solid-wavy.svg',
  'node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2',
  'node_modules/@fontsource-variable/big-shoulders-display/files/big-shoulders-display-latin-wght-normal.woff2',
  'public/assets/brand/patrick/ink.svg']
const sources = await Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(path)) })))
if (process.argv.includes('--check')) {
  const artifact = JSON.parse(await readFile(receipt, 'utf8'))
  if (artifact.sha256 !== hash(await readFile(output)) || JSON.stringify(artifact.inputs) !== JSON.stringify(sources)) {
    throw new Error('Résumé artifact or inputs changed; run npm run render:resume and review the PDF.')
  }
  console.log('Generated résumé bytes and maintained inputs match their receipt.')
} else {
  const resume = JSON.parse(await readFile(paths[0], 'utf8'))
  const contact = await readFile(paths[1], 'utf8')
  if (!contact.includes('recruitingEmail = resume.email')) throw new Error('Résumé and recruiting contact disagree')
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const uri = async (path, type) => `data:${type};base64,${(await readFile(path)).toString('base64')}`
  const body = await uri(paths[4], 'font/woff2'), display = await uri(paths[5], 'font/woff2')
  const mark = await uri(paths[3], 'image/svg+xml')
  // Stretch only this decorative PDF copy; the selected source artwork stays byte-identical.
  const inkSvg = (await readFile(paths[6], 'utf8')).replace('<svg ', '<svg preserveAspectRatio="none" ')
  const ink = `data:image/svg+xml;base64,${Buffer.from(inkSvg).toString('base64')}`
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Patrick Fanella Resume</title><style>
      @font-face { font-family: Body; src: url('${body}'); font-weight: 100 900; }
      @font-face { font-family: Display; src: url('${display}'); font-weight: 100 900; }
      @page { size: Letter; margin: 0; }
      * { box-sizing: border-box; } body { position: relative; isolation: isolate; margin: 0.45in 0.55in; color: #0e1422; font: 10.5pt/1.32 Body, sans-serif; }
      header { text-align: center; border-bottom: 1pt solid #465064; padding-bottom: 10pt; }
      header img { position: absolute; left: 0; top: 8pt; width: 44pt; height: 44pt; opacity: .4; }
      .contact { text-align: center; } h1 { font: 900 32pt/1 Display, sans-serif; margin: 0; }
      .ink-watermark { position: fixed; top: 2.3in; left: -.45in; width: 9.4in; height: 2.6in; object-fit: fill; transform: rotate(-6deg); opacity: .12; z-index: -1; }
      h2 { font: 800 16pt/1.1 Display, sans-serif; margin: 12pt 0 5pt; } h3 { font-size: 11pt; margin: 8pt 0 2pt; }
      p { margin: 3pt 0; } ul { margin: 4pt 0; padding-left: 14pt; } li { margin: 3pt 0; }
      a { color: inherit; text-underline-offset: 2pt; } .meta { color: #465064; font-size: 9pt; }
      section { break-inside: avoid; } dl { margin: 4pt 0; } dl div { display: flex; gap: 8pt; margin: 2pt 0; }
      dt { font-weight: 700; min-width: 85pt; } dd { margin: 0; }
    </style></head><body>
      <img class="ink-watermark" src="${ink}" alt="">
      <header><img alt="" src="${mark}"><div><h1>${escape(resume.name)}</h1><p><strong>${escape(resume.headline)}</strong></p><p class="meta">${escape(resume.location)}. ${escape(resume.availability)}.</p></div></header>
      <p class="contact"><a href="mailto:${escape(resume.email)}">${escape(resume.email)}</a> | ${escape(resume.phone)} | <a href="${resume.website}">patrickfanella.co</a></p>
      <p class="meta contact"><a href="${resume.github}">github.com/PatrickFanella</a> | <a href="${resume.linkedin}">linkedin.com/in/patrick-fanella</a></p>
      <section><h2>Profile</h2><p>${escape(resume.profile)}</p></section>
      <section><h2>Skills</h2><dl>${resume.skills.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></section>
      <h2>Engineering experience</h2>
      ${resume.roles.map(role => `<section><h3>${escape(role.employer)} | ${escape(role.title)}</h3><p class="meta">${escape(role.location)}. ${escape(role.dates)}</p><ul>${role.bullets.slice(0, 3).map(b => `<li>${escape(b)}</li>`).join('')}</ul></section>`).join('')}
      <section><h2>Other experience</h2>${resume.otherRoles.map(role => `<h3>${escape(role.employer)} | ${escape(role.title)}</h3><p class="meta">${escape(role.dates)}</p><p>${escape(role.bullets[0])}</p>`).join('')}</section>
    </body></html>`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    let pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true })
    // Chromium's timestamps and document ID vary by run. Equal-length substitutions preserve xref
    // offsets, while fixed metadata makes identical inputs byte-identical on the pinned browser.
    let bytes = pdf.toString('latin1').replace(/D:\d{14}(?:[+-]\d{2}'\d{2}')?/g, value => 'D:20000101000000' + value.slice(16))
    bytes = bytes.replace(/\/ID\s*\[<([a-f\d]+)>\s*<([a-f\d]+)>\]/gi, (all, first, second) => all.replace(first, '0'.repeat(first.length)).replace(second, '0'.repeat(second.length)))
    pdf = Buffer.from(bytes, 'latin1')
    const pages = (bytes.match(/\/Type \/Page\b/g) ?? []).length
    if (pages !== 1) throw new Error(`Compact résumé must be one page, got ${pages}`)
    await writeFile(output, pdf)
    await writeFile(receipt, JSON.stringify({ path: output, filename: 'Patrick_Fanella_Resume.pdf', sha256: hash(pdf), pages,
      importedSource: resume.provenance, generator: 'scripts/render-resume.mjs', chromium: browser.version(),
      subset: 'Profile, skills, first three bullets per engineering role, and Retail Data Systems; full experience remains on the web.', inputs: sources }, null, 2) + '\n')
    console.log(`Generated one-page résumé: ${hash(pdf)}`)
  } finally { await browser.close() }
}
