// Shared start-up for every page: fonts, theme, the ink tank and the interactions that feed it.
import '@fontsource-variable/big-shoulders-display'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/martian-mono'
import './styles/site.css'
import { createInk, type Ink, type Theme } from './ink/engine'
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

export function boot(): Page {
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
  if (ink) readout(ink)
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
