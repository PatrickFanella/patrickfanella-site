import { manifest } from './clpr-protocol'

/** The controls above the psql output: the example search, the pinned build's provenance, the mode
 *  buttons and the status line. Elements only; the pane wires them to its modes, which also decide
 *  what is enabled and what the status says. */
export function clprControls(liveLabel: string) {
  const controls = document.createElement('div'); controls.className = 'clpr-controls'
  const meta = document.createElement('p'); meta.dataset.clprMeta = ''
  const source = document.createElement('a')
  source.href = `https://github.com/subculture-collective/clpr/tree/${manifest.commit}`
  source.textContent = `Clpr ${manifest.commit.slice(0, 7)}`
  meta.append(source, `; source ${manifest.date.slice(0, 10)}; ${(manifest.wasm.gzipBytes / 1e6).toFixed(2)} MB gzip; ${manifest.goVersion}`)
  const provenance = document.createElement('p'); provenance.dataset.clprProvenance = ''
  if (manifest.builtInClprCI && manifest.ciRun) {
    const ci = document.createElement('a'); ci.href = manifest.ciRun; ci.textContent = 'Built in Clpr CI'
    provenance.append(ci)
  } else provenance.textContent = 'Built outside Clpr CI.'
  provenance.append(' PostgreSQL and its extensions download with live mode. Searches stay in this tab; this demo uses Clpr’s PostgreSQL path and eight fixture clips. The Plan tab can add generated clips.')
  const example = document.createElement('form'); example.className = 'clpr-example'
  const label = document.createElement('label'); label.htmlFor = 'clpr-example'; label.textContent = 'Example search'
  const input = document.createElement('input'); input.id = 'clpr-example'; input.name = 'query'; input.value = 'world record'; input.required = true
  const sample = document.createElement('button'); sample.type = 'submit'; sample.dataset.clprExample = ''
  sample.textContent = `Run example live (${liveLabel.split('(')[1]}`
  example.append(label, input, sample)
  const buttons = document.createElement('div'); buttons.className = 'clpr-buttons'
  const start = document.createElement('button'); start.type = 'button'; start.textContent = liveLabel
  const stop = document.createElement('button'); stop.type = 'button'
  const benchmark = document.createElement('button'); benchmark.type = 'button'; benchmark.textContent = 'Run SQL benchmark'
  // Focusable from script only: a control that disables itself hands focus here (see psql.ts).
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.dataset.clprStatus = ''; status.tabIndex = -1
  buttons.append(start, stop, benchmark); controls.append(example, meta, provenance, buttons, status)
  return { controls, example, input, sample, start, stop, benchmark, status }
}
