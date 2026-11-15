import type { ClprEvent } from '../clpr-protocol'
import type { Statement } from './capture'
import { startPlanView } from './plan-view'

type Result = Extract<ClprEvent, { ev: 'result' }>

function pre(text: string) {
  const element = document.createElement('pre')
  element.textContent = text; element.tabIndex = 0
  return element
}

function summary(statement: Statement) {
  const list = document.createElement('dl')
  // Display clauses from this captured statement, without reconstructing production SQL.
  const sql = statement.sql.replace(/\s+/g, ' ').trim()
  for (const [label, pattern] of [
    ['Read', /\bFROM (.+?)(?=\bWHERE\b|\bORDER BY\b|\bLIMIT\b|$)/i],
    ['Filter', /\bWHERE (.+?)(?=\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/i],
    ['Order', /\bORDER BY (.+?)(?=\bLIMIT\b|\bOFFSET\b|$)/i],
    ['Limit', /\bLIMIT (.+?)(?=\bOFFSET\b|$)/i],
    ['Offset', /\bOFFSET (.+)$/i],
    ['Write', /\bINSERT INTO (.+?)(?=\bVALUES\b|$)/i],
  ] as const) {
    const match = pattern.exec(sql)
    if (!match) continue
    const dt = document.createElement('dt'), dd = document.createElement('dd')
    dt.textContent = label; dd.textContent = match[1].trim(); list.append(dt, dd)
  }
  return list
}

/** HTML sections remain readable without script; only this module turns them into tabs. */
export function startInspector(root: HTMLElement, resize: (rows: number) => Promise<unknown>) {
  const plans = startPlanView(root, resize)
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
  root.hidden = true
  return {
    clear() { root.hidden = true; plans.clear() },
    render(event: Result) {
      root.hidden = false
      root.querySelector<HTMLElement>('[data-inspector-request]')!.textContent = `GET ${event.url} · HTTP ${event.response.status} · measured in this tab on ${event.rows.toLocaleString('en-US')} clips (8 fixtures, ${event.rows - 8} generated)`
      const response = root.querySelector<HTMLElement>('[data-inspector-response]')!
      response.replaceChildren()
      let body: unknown
      try { body = JSON.parse(event.response.body) } catch { /* The raw response is still inspectable. */ }
      const clips = (body as { results?: { clips?: { title?: unknown }[] } } | null)?.results?.clips
      const results = document.createElement('p')
      results.textContent = Array.isArray(clips)
        ? `${clips.length} returned ${clips.length === 1 ? 'clip' : 'clips'}${clips.length ? `: ${clips.map(clip => String(clip.title ?? 'Untitled')).join('; ')}` : '. No matching clips.'}`
        : 'This response contains no clip result list.'
      const headers = document.createElement('h4'); headers.textContent = 'Raw headers'
      const json = document.createElement('h4'); json.textContent = 'JSON response'
      response.append(results, headers, pre(`HTTP ${event.response.status}\n${Object.entries(event.response.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}`),
        json, pre(body === undefined ? event.response.body : JSON.stringify(body, null, 2)))
      const sql = root.querySelector<HTMLElement>('[data-inspector-sql]')!
      sql.replaceChildren()
      const statements = event.calls.flatMap(call => call.statements)
      const executions = statements.filter(statement => statement.kind === 'execute')
      const note = document.createElement('p')
      note.textContent = `${executions.length} executions; ${statements.length - executions.length} prepares. Statements and parameter formats captured from pgx. Binary parameters are shown as hex bytes; their types are not guessed.`
      sql.append(note)
      if (!statements.length) sql.append('This request sent no SQL statements.')
      statements.forEach((statement, index) => {
        const section = document.createElement('section'), heading = document.createElement('h4')
        heading.textContent = `${index + 1}. ${statement.kind === 'prepare' ? 'Prepare' : 'Execute'}`
        const details = document.createElement('details'), full = document.createElement('summary')
        full.textContent = 'Full SQL'; details.append(full, pre(statement.sql))
        section.append(heading, summary(statement), details)
        if (statement.kind === 'execute') {
          const params = document.createElement('p'); params.textContent = 'Parameters ($1, $2, … in order)'
          section.append(params, pre(JSON.stringify(statement.params, null, 2)))
        }
        sql.append(section)
      })
      const timing = root.querySelector<HTMLElement>('[data-inspector-timing]')!
      const inside = event.calls.reduce((sum, call) => sum + call.ms, 0)
      const values = document.createElement('dl'); values.dataset.timing = ''
      for (const [label, value] of [['Total handler request', event.ms], ['Inside PostgreSQL calls', inside], ['Outside PostgreSQL calls', event.ms - inside]] as const) {
        const dt = document.createElement('dt'), dd = document.createElement('dd')
        dt.textContent = label; dd.textContent = `${value.toFixed(1)} ms`; dd.dataset.ms = String(value); values.append(dt, dd)
      }
      const explanation = document.createElement('p')
      explanation.textContent = `${event.calls.length} bridge calls. Inside time is wall time awaiting execProtocolRaw, including protocol work and PostgreSQL. Outside time is the request total minus those calls: Go, Gin, pgx, bridge and JavaScript overhead together. These parts are not measured separately. Browser clock rounding applies; these are fixture timings, not production latency.`
      timing.replaceChildren(values, explanation)
      const wire = root.querySelector<HTMLElement>('[data-inspector-wire]')!
      const wireNote = document.createElement('p')
      wireNote.textContent = 'Actual PostgreSQL protocol bytes at the in-process pgx bridge, grouped by call. Counts include the type byte and four-byte length. These are not network packets or network latency.'
      wire.replaceChildren(wireNote)
      if (!event.calls.length) wire.append('This request made no PostgreSQL bridge calls.')
      event.calls.forEach((call, index) => {
        const heading = document.createElement('h4')
        const sent = call.sent.reduce((sum, message) => sum + message.bytes, 0)
        const received = call.received.reduce((sum, message) => sum + message.bytes, 0)
        heading.textContent = `Call ${index + 1}: ${sent} bytes sent, ${received} bytes received; ${call.ms.toFixed(1)} ms`
        wire.append(heading)
        for (const [label, messages] of [['pgx → PostgreSQL', call.sent], ['PostgreSQL → pgx', call.received]] as const) {
          const direction = document.createElement('p'); direction.textContent = label
          const list = document.createElement('ol')
          messages.forEach(message => {
            const item = document.createElement('li'), details = document.createElement('details'), summary = document.createElement('summary')
            item.append(`${message.name} (${message.type || 'untyped'}): ${message.bytes} bytes. ${message.detail}`)
            summary.textContent = 'Raw message hex'; details.append(summary, pre(message.hex)); item.append(details); list.append(item)
          })
          wire.append(direction, list)
        }
      })
      plans.render(event)
    },
  }
}
