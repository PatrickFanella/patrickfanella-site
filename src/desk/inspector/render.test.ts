import { expect, test } from 'vitest'
import data from './recorded-run.json' with { type: 'json' }
import { parseRecording } from './recording.mjs'
import { responseMarkup, sqlMarkup, wireMarkup } from './render'

test('the shared renderer escapes captured response, SQL, parameters and wire strings', () => {
  const event = structuredClone(parseRecording(data).results[0]), attack = '<img src=x onerror="alert(1)">'
  event.response.body = JSON.stringify({ results: { clips: [{ title: attack }] } })
  event.response.headers.Attack = attack
  event.calls[0].statements = [{ kind: 'execute', sql: `SELECT ${attack}`, params: [{ format: 'text', value: attack }] }]
  event.calls[0].sent[0].detail = attack
  for (const markup of [responseMarkup(event), sqlMarkup(event), wireMarkup(event)]) {
    expect(markup).not.toContain('<img')
    expect(markup).toContain('&lt;img')
  }
})
