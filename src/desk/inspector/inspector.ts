import type { ClprResult } from '../clpr-protocol'
import { responseMarkup, sqlMarkup, timingMarkup, wireMarkup } from './render'
import { startPlanView } from './plan-view'
import { fixtureCount } from './recording.mjs'

/** HTML sections remain readable without script; only this module turns them into tabs.
 *  The psql pane decides whether the inspector is visible; this module only fills it. */
export function startInspector(root: HTMLElement, resize: (rows: number) => Promise<unknown>) {
  const plans = startPlanView(root, resize)
  const recorded = [...root.querySelectorAll<HTMLElement>('[data-inspector-request], [data-inspector-response], [data-inspector-sql], [data-inspector-timing], [data-inspector-wire], [data-plan-status], [data-plan-output]')]
    .map(element => ({ element, html: element.innerHTML }))
  const provenance = root.querySelector<HTMLElement>('[data-inspector-recording]')!
  const form = root.querySelector<HTMLElement>('[data-plan-size]')!
  const tabs = root.querySelector<HTMLElement>('[data-inspector-tabs]')!
  const panels = [...root.querySelectorAll<HTMLElement>(':scope > section')]
  const buttons = panels.map(panel => {
    const button = document.createElement('button')
    button.type = 'button'; button.id = `${panel.id}-tab`
    button.textContent = panel.querySelector('h3')!.textContent
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id)
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id)
    tabs.append(button)
    return button
  })
  const select = (index: number) => buttons.forEach((button, i) => {
    button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1
    panels[i].hidden = i !== index
  })
  tabs.setAttribute('role', 'tablist'); tabs.hidden = false
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index))
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length
        : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1
      if (next < 0) return
      event.preventDefault(); select(next); buttons[next].focus()
    })
  })
  select(0)
  return {
    clear() {
      plans.clear()
      recorded.forEach(({ element, html }) => { element.innerHTML = html })
      root.dataset.mode = 'recorded'; provenance.hidden = false; form.hidden = true
    },
    render(event: ClprResult) {
      root.dataset.mode = 'live'; provenance.hidden = true; form.hidden = false
      root.querySelector<HTMLElement>('[data-inspector-request]')!.textContent = `GET ${event.url} · HTTP ${event.response.status} · measured in this tab on ${event.rows.toLocaleString('en-US')} clips (${fixtureCount} fixtures, ${event.rows - fixtureCount} generated)`
      for (const [name, render] of [['response', responseMarkup], ['sql', sqlMarkup], ['timing', timingMarkup], ['wire', wireMarkup]] as const) {
        root.querySelector<HTMLElement>(`[data-inspector-${name}]`)!.innerHTML = render(event)
      }
      plans.render(event)
    },
  }
}
