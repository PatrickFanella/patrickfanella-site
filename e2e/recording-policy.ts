import data from '../src/desk/inspector/recorded-run.json' with { type: 'json' }
import { checkoutLiveGate } from '../src/desk/inspector/live-policy'
import { parseRecording } from '../src/desk/inspector/recording.mjs'

export const recording = parseRecording(data)
/** The same gate the Desk page was built with. */
export const recordedLiveGate = checkoutLiveGate(recording.meta)
