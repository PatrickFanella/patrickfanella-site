import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { connect, type WorkerLike } from './worker-client.mjs'

type Request = { ev: 'search'; id: number; words: string } | { ev: 'stats' }
type Event = { ev: 'ready' } | { ev: 'result'; id: number; total: number } | { ev: 'error'; id?: number; message: string }

class FixtureWorker implements WorkerLike<Request, Event> {
  onmessage: ((event: MessageEvent<Event>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: Request[] = []
  terminated = false
  prevented = 0
  postMessage(message: Request) { this.sent.push(message) }
  terminate() { this.terminated = true }
  // A terminated worker can still deliver: its callback may already be queued.
  emit(data: Event) { this.onmessage?.({ data } as MessageEvent<Event>) }
  fail(message: string) { this.onerror?.({ message, preventDefault: () => { this.prevented++ } } as unknown as ErrorEvent) }
}

/** A client whose callbacks are written to `calls` in the order they happen. */
function client(options: { slow?: boolean; slowAfter?: number } = {}) {
  const worker = new FixtureWorker(), calls: unknown[][] = []
  const c = connect<Request, Event, string>(worker, {
    event: message => calls.push(['event', message]),
    result: (reply, latest) => { calls.push(['result', reply, latest]); if (reply.total < 0) throw new Error('bad total'); return `${reply.total} found` },
    failed: message => calls.push(['failed', message]),
    refused: message => calls.push(['refused', message]),
    slow: options.slow === false ? undefined : () => calls.push(['slow']),
    slowAfter: options.slowAfter,
    after: () => calls.push(['after']),
  })
  return { worker, calls, c }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

test('requests are numbered from 1 and each resolves with what its reply becomes', async () => {
  const { worker, calls, c } = client()
  const first = c.request({ ev: 'search', words: 'world' }), second = c.request({ ev: 'search', words: 'record' })
  expect(worker.sent).toEqual([{ ev: 'search', id: 1, words: 'world' }, { ev: 'search', id: 2, words: 'record' }])
  worker.emit({ ev: 'result', id: 2, total: 5 })
  worker.emit({ ev: 'result', id: 1, total: 3 })
  await expect(first).resolves.toBe('3 found')
  await expect(second).resolves.toBe('5 found')
  // Only the reply to the newest request is the latest.
  expect(calls).toEqual([
    ['result', { ev: 'result', id: 2, total: 5 }, true], ['after'],
    ['result', { ev: 'result', id: 1, total: 3 }, false], ['after'],
  ])
})

test('a message without an id is an event and is sent without one', () => {
  const { worker, calls, c } = client()
  c.send({ ev: 'stats' })
  expect(worker.sent).toEqual([{ ev: 'stats' }])
  worker.emit({ ev: 'ready' })
  expect(calls).toEqual([['event', { ev: 'ready' }], ['after']])
})

test('a reply that cannot be used rejects its request', async () => {
  const { worker, c } = client()
  const search = c.request({ ev: 'search', words: 'world' })
  worker.emit({ ev: 'result', id: 1, total: -1 })
  await expect(search).rejects.toThrow('bad total')
})

test('a failed request is refused, then rejects with the worker\'s message; the client stays open', async () => {
  const { worker, calls, c } = client()
  const failed = c.request({ ev: 'search', words: '' })
  worker.emit({ ev: 'error', id: 1, message: 'no words' })
  await expect(failed).rejects.toThrow('no words')
  expect(calls).toEqual([['refused', 'no words'], ['after']])
  expect(worker.terminated).toBe(false)
  const next = c.request({ ev: 'search', words: 'world' })
  worker.emit({ ev: 'result', id: 2, total: 1 })
  await expect(next).resolves.toBe('1 found')
})

test('a reply nobody is waiting for changes nothing', async () => {
  const { worker, calls, c } = client()
  const search = c.request({ ev: 'search', words: 'world' })
  worker.emit({ ev: 'result', id: 1, total: 3 })
  await expect(search).resolves.toBe('3 found')
  calls.length = 0
  worker.emit({ ev: 'result', id: 1, total: 9 })
  worker.emit({ ev: 'error', id: 7, message: 'unknown request' })
  expect(calls).toEqual([['after'], ['after']])
})

test('an error without an id is the worker failing', () => {
  const { worker, calls } = client()
  worker.emit({ ev: 'error', message: 'out of memory' })
  expect(calls).toEqual([['event', { ev: 'error', message: 'out of memory' }], ['failed', 'out of memory'], ['after']])
})

test('a load error fails the worker, with a message when the browser gives none', () => {
  const { worker, calls } = client()
  worker.fail('SyntaxError in worker')
  worker.fail('')
  expect(calls).toEqual([['failed', 'SyntaxError in worker'], ['after'], ['failed', 'The worker did not load'], ['after']])
  expect(worker.prevented).toBe(2)
})

test('closing terminates the worker and rejects every pending request with the reason', async () => {
  const { worker, c } = client()
  const first = c.request({ ev: 'search', words: 'world' }), second = c.request({ ev: 'search', words: 'record' })
  c.close('The desk was closed.')
  expect(worker.terminated).toBe(true)
  await expect(first).rejects.toThrow('The desk was closed.')
  await expect(second).rejects.toThrow('The desk was closed.')
})

test('after closing, a reply, an event and an error from the worker are all ignored', async () => {
  const { worker, calls, c } = client()
  const search = c.request({ ev: 'search', words: 'world' })
  c.close('Stopped.')
  worker.emit({ ev: 'result', id: 1, total: 3 })
  worker.emit({ ev: 'ready' })
  worker.emit({ ev: 'error', message: 'late failure' })
  worker.fail('late load error')
  expect(calls).toEqual([])
  await expect(search).rejects.toThrow('Stopped.')
  // Nothing more is sent, and a later request rejects with the same reason.
  c.send({ ev: 'stats' })
  await expect(c.request({ ev: 'search', words: 'again' })).rejects.toThrow('Stopped.')
  expect(worker.sent).toEqual([{ ev: 'search', id: 1, words: 'world' }])
  // A second close keeps the first reason.
  c.close('Stopped again.')
  await expect(c.request({ ev: 'search', words: 'again' })).rejects.toThrow('Stopped.')
})

test('a callback may close the client: a refused request then rejects with the reason', async () => {
  const worker = new FixtureWorker()
  const c = connect<Request, Event, string>(worker, {
    event: () => {}, result: () => '', failed: () => {},
    refused: () => c.close('Live mode stopped.'),
  })
  const search = c.request({ ev: 'search', words: 'world' })
  worker.emit({ ev: 'error', id: 1, message: 'handler crashed' })
  await expect(search).rejects.toThrow('Live mode stopped.')
  expect(worker.terminated).toBe(true)
})

test('the slow notice comes once after 30 s, unless the worker has started', () => {
  const late = client()
  vi.advanceTimersByTime(29_999)
  expect(late.calls).toEqual([])
  vi.advanceTimersByTime(1)
  expect(late.calls).toEqual([['slow'], ['after']])
  vi.advanceTimersByTime(60_000)
  expect(late.calls).toHaveLength(2)

  const prompt = client()
  prompt.c.started()
  vi.advanceTimersByTime(60_000)
  expect(prompt.calls).toEqual([])
})

test('closing cancels the slow notice, and its delay can be set', () => {
  const closed = client({ slowAfter: 500 })
  closed.c.close('Stopped.')
  vi.advanceTimersByTime(500)
  expect(closed.calls).toEqual([])

  const short = client({ slowAfter: 500 })
  vi.advanceTimersByTime(500)
  expect(short.calls).toEqual([['slow'], ['after']])
})
