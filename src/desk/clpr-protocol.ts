import manifest from '../../public/clpr/manifest.json' with { type: 'json' }
import type { DatabaseCall } from './inspector/capture'

export { manifest }
export const artifactBase = `/clpr/${manifest.commit}/`

export interface ClprResponse { status: number; headers: Record<string, string>; body: string }
export interface ClprRequest { id: number; words: string }
export type ClprEvent =
  | { ev: 'progress'; message: string }
  | { ev: 'ready'; migrations: number; rows: number; version: string }
  | { ev: 'result'; id: number; url: string; response: ClprResponse; ms: number; calls: DatabaseCall[] }
  | { ev: 'error'; message: string }
