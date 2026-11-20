import { describe, expect, it } from 'vitest'
import {
  admitBursts, advanceBursts, canQueueBurst, canvasSize, finalSteps, gpuCappedSteps, gridSize,
  isResizeNoop, probeSteps, resizeKeep, stepsThatFit, stillRemake,
} from './schedule'

const GL: [number, number] = [256, 256], GPU: [number, number] = [320, 320]
const burst = (id: number, left = 1) => ({ id, left })

describe('burst queue', () => {
  it('runs four at once and holds the rest in order', () => {
    const waiting = [1, 2, 3, 4, 5, 6].map((i) => burst(i))
    const { active, waiting: rest } = admitBursts([], waiting)
    expect(active.map((q) => q.id)).toEqual([1, 2, 3, 4])
    expect(rest.map((q) => q.id)).toEqual([5, 6])
  })

  it('queues a burst that arrives while four run, and starts it when one ends', () => {
    let { active, waiting } = admitBursts([], [1, 2, 3, 4].map((i) => burst(i, i === 1 ? 1 : 5)))
    ;({ active, waiting } = admitBursts(active, [...waiting, burst(5)]))
    expect(active).toHaveLength(4)
    expect(waiting.map((q) => q.id)).toEqual([5])
    active = advanceBursts(active)
    expect(active.map((q) => q.id)).toEqual([2, 3, 4])
    ;({ active, waiting } = admitBursts(active, waiting))
    expect(active.map((q) => q.id)).toEqual([2, 3, 4, 5])
    expect(waiting).toEqual([])
  })

  it('keeps a multi-step burst until its steps are spent', () => {
    let active = [burst(1, 3)]
    active = advanceBursts(active); expect(active[0].left).toBe(2)
    active = advanceBursts(advanceBursts(active)); expect(active).toEqual([])
  })

  it('drops bursts once 24 wait', () => {
    expect(canQueueBurst(23)).toBe(true)
    expect(canQueueBurst(24)).toBe(false)
  })
})

describe('preroll budget', () => {
  it('stops a slow backend short of the step count', () => {
    // 40 ms per step against a 1500 ms budget: the first step leaves room for 36, not 240.
    const fits = stepsThatFit(1500, 40, 1, 40)
    expect(fits).toBe(36)
    expect(finalSteps(239, fits)).toBe(36)
  })

  it('leaves nothing to send once the budget is spent', () => {
    const fits = stepsThatFit(1500, 1800, 1, 300)
    expect(fits).toBeLessThan(1)
    expect(probeSteps(fits, 239)).toBe(0)
    expect(Math.max(0, finalSteps(239, fits))).toBe(0)
  })

  it('probes with up to eight steps, and not at all when every step fits', () => {
    expect(probeSteps(100, 239)).toBe(8)
    expect(probeSteps(5, 239)).toBe(2)
    expect(probeSteps(1, 239)).toBe(1)
    expect(probeSteps(300, 239)).toBe(0)
  })

  it('floors a step cost at 0.01 ms', () => {
    expect(stepsThatFit(10, 0, 1, 0)).toBe(1000)
  })

  it('caps a WebGPU preroll by its measured step cost, with at least one step', () => {
    expect(gpuCappedSteps(240, 1500, 20)).toBe(75)
    expect(gpuCappedSteps(240, 1500, 5000)).toBe(1)
    expect(gpuCappedSteps(40, 1500, 1)).toBe(40)
  })
})

describe('grid sizing', () => {
  it('uses the phone rows on a portrait phone', () => {
    expect(gridSize(390, 844, GL)).toEqual({ simW: 118, simH: 256, dyeW: 390, dyeH: 844 })
  })

  it('uses the wide rows on a desktop viewport and scales the dye grid to 1100 px', () => {
    expect(gridSize(2560, 1080, GL)).toEqual({ simW: 607, simH: 256, dyeW: 1100, dyeH: 464 })
    expect(gridSize(2560, 1080, GPU)).toEqual({ simW: 759, simH: 320, dyeW: 1100, dyeH: 464 })
  })

  it('does not scale a small viewport up, and never goes under 16 columns', () => {
    expect(gridSize(800, 600, GL)).toMatchObject({ dyeW: 800, dyeH: 600 })
    expect(gridSize(5, 1000, GL).simW).toBe(16)
  })

  it('switches to phone rows at 700 px wide', () => {
    expect(gridSize(700, 900, [320, 200]).simH).toBe(200)
    expect(gridSize(701, 900, [320, 200]).simH).toBe(320)
  })

  it('caps the canvas at 2x pixels and at the backend limit', () => {
    expect(canvasSize(390, 844, 3)).toEqual({ w: 780, h: 1688 })
    expect(canvasSize(2560, 1080, 1)).toEqual({ w: 2560, h: 1080 })
    expect(canvasSize(2560, 1080, 2, 4096)).toEqual({ w: 4096, h: 1728 })
    expect(canvasSize(390, 844, 0)).toEqual({ w: 390, h: 844 })
  })
})

describe('resize', () => {
  it('does nothing at an unchanged size', () => {
    expect(isResizeNoop(true, [780, 1688], [780, 1688], [390, 844], [390, 844])).toBe(true)
  })

  it('lays out again for a new viewport, a cleared canvas, or another backend', () => {
    expect(isResizeNoop(true, [780, 1688], [780, 1688], [390, 844], [390, 900])).toBe(false)
    expect(isResizeNoop(true, [780, 1688], [0, 0], [390, 844], [390, 844])).toBe(false)
    expect(isResizeNoop(false, [780, 1688], [780, 1688], [390, 844], [390, 844])).toBe(false)
  })

  it('hands the backend the new viewport over the old as the keep ratio', () => {
    expect(resizeKeep(390, 844, 390, 764)).toEqual([1, 844 / 764])
    expect(resizeKeep(195, 422, 390, 844)).toEqual([0.5, 0.5])
  })
})

describe('reduced-motion still', () => {
  it('keeps the still while a toolbar shows or hides, so scrolling never swaps the frame', () => {
    expect(stillRemake(390, 764, 390, 844)).toBe(false)
    expect(stillRemake(390, 844, 390, 764)).toBe(false)
  })

  it('remakes it when the width changes', () => {
    expect(stillRemake(844, 390, 390, 844)).toBe(true)
  })

  it('remakes it when the height moves by more than the toolbar', () => {
    expect(stillRemake(390, 723, 390, 844)).toBe(true)
    expect(stillRemake(390, 724, 390, 844)).toBe(false)
    expect(stillRemake(390, 965, 390, 844)).toBe(true)
  })
})
