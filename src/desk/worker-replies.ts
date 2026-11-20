// A Desk worker's side of the protocol in worker-client.mjs: one way to post an event, one way to
// report a failure and one queue that answers requests in the order they arrive. Both worker scripts
// pass in `self`.

/** The worker's global scope, as far as this module uses it. */
export interface WorkerScope {
  postMessage(message: unknown): void
  onmessage: ((event: MessageEvent) => void) | null
  addEventListener(type: 'error' | 'unhandledrejection', listener: (event: { message?: string; reason?: unknown }) => void): void
}

export function replies<Request extends { ev: string; id?: number }, Event extends { ev: string }>(scope: WorkerScope) {
  // Every message carries the worker's clock, which the page translates to its own.
  const send = (message: object) => scope.postMessage({ ...message, at: performance.timeOrigin + performance.now() })
  /** With an id, that request failed; without one, the worker did. */
  const fail = (error: unknown, id?: number) =>
    send({ ev: 'error', ...(id === undefined ? {} : { id }), message: error instanceof Error ? error.message : String(error) })
  // A rejection nothing awaits, such as Emscripten failing to fetch or compile PostgreSQL's
  // WebAssembly, never reaches the page's Worker.onerror, so report it from here.
  scope.addEventListener('unhandledrejection', event => fail(event.reason))
  scope.addEventListener('error', event => fail(event.message))
  let queue = Promise.resolve()
  return {
    post: (event: Event) => send(event),
    fail,
    /** Start answering requests, one at a time. What `answer` returns for a request with an id is
     *  posted as its result; what it throws, as that request's failure. */
    serve(answer: (request: Request) => Promise<object | void>) {
      scope.onmessage = ({ data }: MessageEvent<Request>) => {
        queue = queue.then(async () => {
          try {
            const result = await answer(data)
            if (data.id !== undefined) send({ ev: 'result', id: data.id, ...result })
          } catch (error) { fail(error, data.id) }
        })
      }
    },
  }
}
