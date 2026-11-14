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

export interface Page { ink: Ink | null; bleeder: ReturnType<typeof bleed> | null }

export function boot(): Page {
  const t = storedTheme(); if (t) root.dataset.theme = t
  const canvas = document.getElementById('ink') as HTMLCanvasElement | null
  let ink: Ink | null = null
  if (canvas) {
    try { ink = createInk(canvas, currentTheme()) } catch (err) {
      root.classList.add('no-ink')
      console.info('Ink is off:', (err as Error).message)
    }
  }
  systemDark.addEventListener('change', () => ink?.setTheme(currentTheme()))
  wireThemeSwitch(ink)
  const bleeder = ink ? bleed(ink) : null
  if (ink) splash(ink)
  if (ink) readout(ink)
  return { ink, bleeder }
}

/** theme-switch: the new theme spreads out from the switch as a circle (view transition). */
function wireThemeSwitch(ink: Ink | null) {
  const btn = document.querySelector<HTMLButtonElement>('[data-theme-switch]')
  if (!btn) return
  const label = () => { const dark = currentTheme() === 'dark'; btn.setAttribute('aria-pressed', String(dark)); btn.querySelector('span')!.textContent = dark ? 'Dark' : 'Light' }
  label()
  btn.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    const apply = () => { root.dataset.theme = next; try { localStorage.setItem(KEY, next) } catch { /* private window */ } ink?.setTheme(next); label() }
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
    el.querySelector('[data-k=grid]')!.textContent = i.grid
    el.querySelector('[data-k=fps]')!.textContent = i.running ? `${Math.round(i.fps)} fps` : 'still frame'
    // "ANGLE (AMD, AMD Radeon Graphics (radeonsi ...), OpenGL ES 3.2)" reads as "AMD Radeon Graphics".
    const parts = i.renderer.replace(/^ANGLE \((.*)\)$/, '$1').split(',')
    el.querySelector('[data-k=gpu]')!.textContent = (parts[1] ?? parts[0]).replace(/\s*\(.*$/, '').trim()
  }
  paint(); setInterval(paint, 1000)
}
