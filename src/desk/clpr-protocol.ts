import manifest from '../../public/clpr/manifest.json' with { type: 'json' }
import type { DatabaseCall } from './inspector/capture'
import type { PlanSample } from './inspector/plans'

export { manifest }
export const artifactBase = `/clpr/${manifest.commit}/`

export interface ClprResponse { status: number; headers: Record<string, string>; body: string }
/** The messages between the desk and Clpr's worker; worker-client.mjs says how they are tagged. */
export interface ClprRequest { ev: 'search'; id: number; words: string; rows?: number }
export type ClprEvent = (
  | { ev: 'progress'; message: string }
  | { ev: 'ready'; migrations: number; rows: number; version: string }
  | { ev: 'result'; id: number; url: string; response: ClprResponse; ms: number; calls: DatabaseCall[]; rows: number; plan?: PlanSample; planError?: string }
  | { ev: 'error'; id?: number; message: string }
) & { at?: number }
/** A search's reply: the handler's response, the captured database calls and the plan comparison. */
export type ClprResult = Extract<ClprEvent, { ev: 'result' }>
