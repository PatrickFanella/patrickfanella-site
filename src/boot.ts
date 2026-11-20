// Shared start-up for every page: fonts, theme, the ink tank and the interactions that feed it.
import '@fontsource-variable/big-shoulders-display'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/martian-mono'
import './styles/site.css'
import { createInk, type Ink, type Theme } from './ink/engine'
import { DISPLAY_FACE } from './display-face'
import { bleed, reduced, splash } from './motion/motion'

const root = document.documentElement
const KEY = 'pf-theme'

function storedTheme(): Theme | null {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null } catch { return null }
}
const systemDark = matchMedia('(prefers-color-scheme: dark)')
export const currentTheme = (): Theme => (root.dataset.theme as Theme | undefined) ?? (systemDark.matches ? 'dark' : 'light')

function syncBrowserTheme() {
  const color = getComputedStyle(root).getPropertyValue('--ground').trim()
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color
}

export interface Page { ink: Ink | null; bleeder: ReturnType<typeof bleed> | null }

/**
 * Starts the page and brings its ink to rest or to life once the display face and the solver are
 * ready. `pour` runs at that point, with null when no ink can be drawn: it measures the final
 * layout and lands the page's letters.
 */
export function boot(pour?: (ink: Ink | null) => void): Page {
  const t = storedTheme(); if (t) root.dataset.theme = t
  syncBrowserTheme()
  const canvas = document.getElementById('ink') as HTMLCanvasElement | null
  let ink: Ink | null = null
  if (canvas) {
    // Neither WebGPU nor WebGL2 can draw it: show the static wash instead.
    const off = (err: Error) => { root.classList.add('no-ink'); console.info('Ink is off:', err.message) }
    try { ink = createInk(canvas, currentTheme(), off) } catch (err) { off(err as Error) }
  }
  systemDark.addEventListener('change', () => { ink?.setTheme(currentTheme()); syncBrowserTheme() })
  wireThemeSwitch(ink)
  const header = document.querySelector<HTMLElement>('[data-site-header]')
  if (header) {
    const measure = () => root.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`)
    measure()
    new ResizeObserver(measure).observe(header)
  }
  const bleeder = ink ? bleed(ink) : null
  if (ink) splash(ink)
  // A canvas shows black until the solver first draws on it, so it stays transparent until then
  // and fades in over the ground it matches.
  void ink?.ready.then(() => requestAnimationFrame(() => root.classList.add('ink-on')))
  if (ink) readout(ink)
  if (ink && new URLSearchParams(location.search).has('ink-debug')) debugPanel(ink)
  // Layout is final once the display face has loaded.
  void Promise.all([document.fonts.load(DISPLAY_FACE).catch(() => []).then(() => document.fonts.ready), ink?.ready]).then(() => {
    ink?.invalidate()
    // With motion the tank is running before the pour, so each splash lands in moving water. With
    // reduced motion the solver runs ahead over what was poured and the page shows one still frame.
    const still = reduced()
    if (!still) ink?.setRunning(true)
    pour?.(ink)
    if (still) ink?.preroll(240, 1500)
  })
  return { ink, bleeder }
}

/** theme-switch: the new theme spreads out from the switch as a circle (view transition). */
function wireThemeSwitch(ink: Ink | null) {
  const btn = document.querySelector<HTMLButtonElement>('[data-theme-switch]')
  if (!btn) return
  // The name is "Theme: Light" or "Theme: Dark", so it always contains the word on screen.
  const label = () => { const dark = currentTheme() === 'dark'; btn.toggleAttribute('data-dark', dark); btn.querySelector('[data-theme-name]')!.textContent = dark ? 'Dark' : 'Light' }
  label(); btn.hidden = false
  btn.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    const apply = () => { root.dataset.theme = next; try { localStorage.setItem(KEY, next) } catch { /* private window */ } ink?.setTheme(next); syncBrowserTheme(); label() }
    if (!document.startViewTransition || reduced()) return apply()
    const r = btn.getBoundingClientRect()
    root.style.setProperty('--vt-x', `${r.left + r.width / 2}px`)
    root.style.setProperty('--vt-y', `${r.top + r.height / 2}px`)
    root.classList.add('vt-theme')
    document.startViewTransition(apply).finished.finally(() => root.classList.remove('vt-theme'))
  })
}

function readout(ink: Ink) {
  const el = document.querySelector<HTMLElement>('[data-ink-readout]')
  if (!el) return
  const paint = () => {
    const i = ink.info()
    el.querySelector('[data-k=path]')!.textContent = `Stable fluids, ${i.path}`
    el.querySelector('[data-k=grid]')!.textContent = i.grid
    el.querySelector('[data-k=fps]')!.textContent = i.running ? `${Math.round(i.fps)} fps` : 'still frame'
    // "ANGLE (AMD, AMD Radeon Graphics (radeonsi ...), OpenGL ES 3.2)" reads as "AMD Radeon Graphics".
    const parts = i.renderer.replace(/^ANGLE \((.*)\)$/, '$1').split(',')
    el.querySelector('[data-k=gpu]')!.textContent = (parts[1] ?? parts[0]).replace(/\s*\(.*$/, '').trim() || '…'
  }
  paint(); void ink.ready.then(paint); setInterval(paint, 1000)
}

/** `?ink-debug`: live counters over the page, to see on a phone whether frames run and reach the screen. */
function debugPanel(ink: Ink) {
  const el = document.createElement('pre')
  el.style.cssText = 'position:fixed;left:4px;top:60px;z-index:99;margin:0;padding:6px;font:11px/1.35 monospace;background:#000c;color:#0f0;pointer-events:none;white-space:pre-wrap;max-width:60vw'
  document.body.append(el)
  const log: string[] = []
  for (const k of ['info', 'warn', 'error'] as const) {
    const orig = console[k].bind(console)
    console[k] = (...a: unknown[]) => { log.push(`${k}: ${a.map(String).join(' ')}`.slice(0, 140)); log.splice(0, log.length - 4); orig(...a) }
  }
  let rafs = 0
  const tick = () => { rafs++; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  let at = performance.now(), prev = { rafs: 0, steps: 0, draws: 0 }
  setInterval(() => {
    const i = ink.info(), now = performance.now(), s = (now - at) / 1000
    const rate = (n: number, p: number) => ((n - p) / s).toFixed(0)
    const c = document.querySelector<HTMLCanvasElement>('#ink')
    el.textContent = [
      `${i.path} | running ${i.running}`,
      `raf/s ${rate(rafs, prev.rafs)}  steps/s ${rate(i.steps, prev.steps)}  draws/s ${rate(i.draws, prev.draws)}`,
      `steps ${i.steps} draws ${i.draws} resizes ${i.resizes}`,
      `view ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} canvas ${c?.width}x${c?.height}`,
      `hidden ${document.hidden} classes ${document.documentElement.className}`,
      ...log,
    ].join('\n')
    at = now; prev = { rafs, steps: i.steps, draws: i.draws }
  }, 500)
}
