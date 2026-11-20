import type { ClprEvent } from '../clpr-protocol'
import type { PlanSample } from './plans'
import { fixtureCount } from './recording.mjs'
import { number, scan, planMarkup } from './render'

export function startPlanView(root: HTMLElement, resize: (rows: number) => Promise<unknown>) {
  const form = root.querySelector<HTMLFormElement>('[data-plan-size]')!
  const select = form.querySelector<HTMLSelectElement>('select')!
  const button = form.querySelector<HTMLButtonElement>('button')!
  const status = root.querySelector<HTMLElement>('[data-plan-status]')!
  const output = root.querySelector<HTMLElement>('[data-plan-output]')!
  const samples = new Map<number, PlanSample>()
  // A focused control that disables itself would drop keyboard focus to the body; the status line,
  // which says what is running, takes it first, as in the psql pane's controls.
  status.tabIndex = -1
  let url = '', generation = 0
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const current = ++generation
    if (form.contains(document.activeElement)) status.focus()
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
      status.textContent = `${number(event.rows)} clips: ${chosen}. Plans measured in this tab after ANALYZE; eight fixtures plus ${number(event.rows - fixtureCount)} generated clips. The selected size re-runs the handler too.`
      output.innerHTML = planMarkup(points, sample, true)
    },
  }
}
