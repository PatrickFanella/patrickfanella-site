// @ts-check
// The page's side of a Desk worker: request ids, the requests still waiting, the notice that the
// worker is slow to start, replies that no longer count, load errors and teardown. The SQL benchmark,
// Clpr live mode and scripts/record-clpr.mjs all talk to their worker through connect(); the worker's
// side is worker-replies.ts. Plain JavaScript with no imports, because the recorder serves this file
// to its harness page as it is.
//
// The messages, in both protocols:
//   { ev, ... }                    an event from the worker, or a message to it that expects no reply
//   { ev, id, ... }                a request
//   { ev: 'result', id, ... }      its reply
//   { ev: 'error', id, message }   its failure
//   { ev: 'error', message }       the worker itself failed

/**
 * A worker as the client uses it. `Worker` fits; a test passes a fixture.
 * @template Request, Event
 * @typedef {object} WorkerLike
 * @property {(message: Request) => void} postMessage
 * @property {() => void} terminate
 * @property {((event: MessageEvent<Event>) => void) | null} onmessage
 * @property {((event: ErrorEvent) => void) | null} onerror
 */

/**
 * What the caller does with what the worker says. A callback may call close().
 * @template Event, Result
 * @typedef {object} Handlers
 * @property {(message: Event) => void} event A message that answers no request, a bare error included.
 * @property {(reply: Extract<Event, { ev: 'result' }>, latest: boolean) => Result} result Turn a reply
 *   into what its request resolves to; a throw rejects the request. `latest` says the reply answers
 *   the newest request.
 * @property {(message: string) => void} failed The worker failed or its script did not load.
 * @property {(message: string) => void} [refused] A request failed, before its promise rejects.
 * @property {() => void} [slow] Called once if started() has not been called after `slowAfter` ms.
 * @property {number} [slowAfter] 30 s unless given.
 * @property {() => void} [after] Called after any of the above.
 */

/**
 * @template {{ ev: string }} Request
 * @template {{ ev: string }} Event
 * @template Result
 * @param {WorkerLike<Request, Event>} worker
 * @param {Handlers<Event, Result>} on
 */
export function connect(worker, on) {
  /** @type {Map<number, { resolve(result: Result): void, reject(error: Error): void }>} */
  const pending = new Map()
  let lastId = 0
  /** @type {string | undefined} */
  let closed
  // A download can take minutes on a slow link, and no deadline can tell that from a hung fetch, so
  // the client only says the worker is slow; whatever arrives later still counts.
  const slow = on.slow && setTimeout(() => { on.slow?.(); on.after?.() }, on.slowAfter ?? 30_000)

  worker.onmessage = ({ data }) => {
    if (closed !== undefined) return
    const message = /** @type {{ ev: string, id?: number, message: string }} */ (/** @type {unknown} */ (data))
    if (message.id === undefined) {
      on.event(data)
      if (message.ev === 'error') on.failed(message.message)
    } else {
      // A reply nobody is waiting for changes nothing.
      const request = pending.get(message.id)
      if (request && message.ev === 'error') {
        on.refused?.(message.message)
        pending.delete(message.id); request.reject(new Error(message.message))
      } else if (request) {
        pending.delete(message.id)
        try { request.resolve(on.result(/** @type {Extract<Event, { ev: 'result' }>} */ (data), message.id === lastId)) }
        catch (error) { request.reject(error instanceof Error ? error : new Error(String(error))) }
      }
    }
    on.after?.()
  }
  worker.onerror = event => {
    event.preventDefault()
    if (closed !== undefined) return
    on.failed(event.message || 'The worker did not load')
    on.after?.()
  }

  return {
    /**
     * Send a request under the next id; the promise settles with its reply.
     * @param {Request extends { id: number } ? Omit<Request, 'id'> : never} message
     * @returns {Promise<Result>}
     */
    request(message) {
      if (closed !== undefined) return Promise.reject(new Error(closed))
      const id = ++lastId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage(/** @type {Request} */ (/** @type {unknown} */ ({ ...message, id })))
      })
    },
    /**
     * Send a message that expects no reply.
     * @param {Exclude<Request, { id: number }>} message
     */
    send(message) { if (closed === undefined) worker.postMessage(message) },
    /** The worker is up: cancel the slow notice. */
    started() { clearTimeout(slow) },
    /**
     * Terminate the worker and reject every waiting request with `reason`. Whatever the worker
     * delivers after this is ignored.
     * @param {string} reason
     */
    close(reason) {
      if (closed !== undefined) return
      closed = reason
      clearTimeout(slow); worker.terminate()
      for (const request of pending.values()) request.reject(new Error(reason))
      pending.clear()
    },
  }
}
