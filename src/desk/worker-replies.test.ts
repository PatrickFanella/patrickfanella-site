import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { replies, type WorkerScope } from './worker-replies'

type Request = { ev: 'search'; id: number; words: string } | { ev: 'stats' }
type Event = { ev: 'ready'; version: string } | { ev: 'result'; id: number; total: number } | { ev: 'error'; id?: number; message: string }

/** A worker scope that keeps what is posted and lets a test deliver requests and global errors. */
function scope() {
  const posted: unknown[] = []
  const listeners = new Map<string, (event: { message?: string; reason?: unknown }) => void>()
  const self: WorkerScope = {
    postMessage: message => { posted.push(message) }, onmessage: null,
    addEventListener: (type, listener) => { listeners.set(type, listener) },
  }
  return { self, posted, listeners, deliver: (data: Request) => self.onmessage?.({ data } as MessageEvent) }
}
const settled = () => new Promise<void>(resolve => setTimeout(resolve))

// The worker's clock reads 1,000 ms after an origin of 1,700,000,000,000.
beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1_700_000_000_000)
})
afterEach(() => { vi.restoreAllMocks() })

test('every posted message carries the worker\'s clock', () => {
  const s = scope()
  replies<Request, Event>(s.self).post({ ev: 'ready', version: '18.6' })
  expect(s.posted).toEqual([{ ev: 'ready', version: '18.6', at: 1_700_000_001_000 }])
})

test('a failure names its request, or the worker when there is none', () => {
  const s = scope()
  const { fail } = replies<Request, Event>(s.self)
  fail(new Error('no words'), 4)
  fail('the runtime stopped')
  expect(s.posted).toEqual([
    { ev: 'error', id: 4, message: 'no words', at: 1_700_000_001_000 },
    { ev: 'error', message: 'the runtime stopped', at: 1_700_000_001_000 },
  ])
})

test('an uncaught error and an unhandled rejection are reported as the worker failing', () => {
  const s = scope()
  replies<Request, Event>(s.self)
  s.listeners.get('error')!({ message: 'Uncaught TypeError' })
  s.listeners.get('unhandledrejection')!({ reason: new Error('wasm did not compile') })
  expect(s.posted).toEqual([
    { ev: 'error', message: 'Uncaught TypeError', at: 1_700_000_001_000 },
    { ev: 'error', message: 'wasm did not compile', at: 1_700_000_001_000 },
  ])
})

test('requests are answered one at a time, in the order they arrive', async () => {
  const s = scope(), order: string[] = []
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  replies<Request, Event>(s.self).serve(async request => {
    if (request.ev !== 'search') return
    order.push(`start ${request.words}`)
    if (request.words === 'first') await held
    order.push(`end ${request.words}`)
    return { total: request.words.length }
  })
  s.deliver({ ev: 'search', id: 1, words: 'first' })
  s.deliver({ ev: 'search', id: 2, words: 'second' })
  await settled()
  expect(order).toEqual(['start first'])
  expect(s.posted).toEqual([])
  release()
  await settled()
  expect(order).toEqual(['start first', 'end first', 'start second', 'end second'])
  expect(s.posted).toEqual([
    { ev: 'result', id: 1, total: 5, at: 1_700_000_001_000 },
    { ev: 'result', id: 2, total: 6, at: 1_700_000_001_000 },
  ])
})

test('a request that throws fails alone, and the queue goes on', async () => {
  const s = scope()
  replies<Request, Event>(s.self).serve(async request => {
    if (request.ev === 'stats') throw new Error('database gone')
    if (!request.words) throw new Error('no words')
    return { total: 1 }
  })
  s.deliver({ ev: 'search', id: 1, words: '' })
  s.deliver({ ev: 'stats' })
  s.deliver({ ev: 'search', id: 2, words: 'world' })
  await settled()
  expect(s.posted).toEqual([
    { ev: 'error', id: 1, message: 'no words', at: 1_700_000_001_000 },
    // A message without an id has no request to fail, so the worker reports itself failed.
    { ev: 'error', message: 'database gone', at: 1_700_000_001_000 },
    { ev: 'result', id: 2, total: 1, at: 1_700_000_001_000 },
  ])
})

test('a message without an id gets no reply', async () => {
  const s = scope()
  replies<Request, Event>(s.self).serve(async () => {})
  s.deliver({ ev: 'stats' })
  await settled()
  expect(s.posted).toEqual([])
})
