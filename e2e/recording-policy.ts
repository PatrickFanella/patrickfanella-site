import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import inputs from '../src/desk/inspector/recording-inputs.json' with { type: 'json' }
import recording from '../src/desk/inspector/recorded-run.json' with { type: 'json' }
import { liveGate } from '../src/desk/inspector/live-policy'
import { manifest } from '../src/desk/clpr-protocol'

const hash = createHash('sha256')
for (const path of inputs) hash.update(path).update('\0').update(readFileSync(path)).update('\0')
export const recordedLiveGate = liveGate(recording.meta, hash.digest('hex'), manifest)
