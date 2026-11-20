import { describe, expect, it } from 'vitest'
import { BLEED, bleedStep } from './motion'

// Run bleed from s to target at a steady frame interval; returns the time it took in ms.
function fade(s: number, target: number, frameMs: number) {
  let t = 0
  while (s !== target) { s = bleedStep(s, target, frameMs); t += frameMs }
  return t
}

describe('bleedStep', () => {
  // Rounding can add a last, tiny step, so each figure is good to within one frame.
  const frame = 1000 / 60 + 1e-9
  it('fades in over 240 ms and out over 400 ms', () => {
    expect(Math.abs(fade(0, 1, 1000 / 60) - BLEED.in)).toBeLessThanOrEqual(frame)
    expect(Math.abs(fade(1, 0, 1000 / 60) - BLEED.out)).toBeLessThanOrEqual(frame)
  })

  it('takes as long on a 120 Hz screen as on 60 Hz', () => {
    expect(Math.abs(fade(0, 1, 1000 / 120) - fade(0, 1, 1000 / 60))).toBeLessThanOrEqual(frame)
    expect(Math.abs(fade(1, 0, 1000 / 120) - fade(1, 0, 1000 / 60))).toBeLessThanOrEqual(frame)
  })

  it('stops at the target without overshooting', () => {
    expect(bleedStep(0.99, 1, 100)).toBe(1)
    expect(bleedStep(0.01, 0, 100)).toBe(0)
    expect(bleedStep(0.5, 0.5, 16)).toBe(0.5)
  })
})
