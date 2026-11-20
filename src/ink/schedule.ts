// The engine's arithmetic as pure functions on plain numbers, so it can be tested without a
// canvas or a GPU. engine.ts owns the state and the timing; the decisions live here.

/** Bursts that run at once, and bursts that may wait; a burst past the second is dropped. */
export const MAX_ACTIVE = 4
export const MAX_WAITING = 24
// A phone's toolbar changes the viewport height by up to about this many CSS px.
export const TOOLBAR_PX = 120

export const canQueueBurst = (waiting: number) => waiting < MAX_WAITING

/** Moves waiting bursts into free slots, oldest first. The inputs are left alone. */
export function admitBursts<T>(active: readonly T[], waiting: readonly T[]) {
  const take = Math.min(Math.max(0, MAX_ACTIVE - active.length), waiting.length)
  return { active: [...active, ...waiting.slice(0, take)], waiting: waiting.slice(take) }
}

/** After a step: each burst has one step fewer to push, and a spent one drops out. */
export function advanceBursts<T extends { left: number }>(active: readonly T[]): T[] {
  return active.map((q) => ({ ...q, left: q.left - 1 })).filter((q) => q.left > 0)
}

/** Backing size of the canvas: device pixels capped at 2x and at the backend's largest canvas. */
export function canvasSize(vw: number, vh: number, devicePixelRatio: number, maxSize = Infinity) {
  const dpr = Math.min(devicePixelRatio || 1, 2, maxSize / Math.max(vw, vh))
  return { w: Math.min(maxSize, Math.round(vw * dpr)), h: Math.min(maxSize, Math.round(vh * dpr)) }
}

/**
 * Solver and dye grids for a viewport. `rows` is a backend's [wide screen, phone] grid height;
 * a phone is a viewport up to 700 CSS px wide. The dye grid is the viewport scaled to fit 1100 px.
 */
export function gridSize(vw: number, vh: number, rows: readonly [number, number]) {
  const simH = rows[vw <= 700 ? 1 : 0]
  const dyeScale = Math.min(1, 1100 / Math.max(vw, vh))
  return {
    simW: Math.max(16, Math.round(simH * vw / vh)), simH,
    dyeW: Math.round(vw * dyeScale), dyeH: Math.round(vh * dyeScale),
  }
}

/** A resize that changes nothing must not touch the canvas: assigning its size clears it. */
export function isResizeNoop(
  sameBackend: boolean, canvas: [number, number], backing: [number, number],
  last: [number, number], view: [number, number],
) {
  return sameBackend && backing[0] === canvas[0] && backing[1] === canvas[1] && last[0] === view[0] && last[1] === view[1]
}

/** `keep` for Backend.resize: the new viewport over the old, so carried ink stays put on screen. */
export const resizeKeep = (vw: number, vh: number, lastW: number, lastH: number): [number, number] => [vw / lastW, vh / lastH]

/**
 * Whether a reduced-motion still must be made again after a resize: the width changed, the
 * height moved by more than a toolbar, or the viewport is taller than what is left of the still
 * (`cut`, the least height seen since it was made). Returns the new `cut` too.
 */
export function stillRemake(vw: number, vh: number, stillW: number, stillH: number, cut: number) {
  const next = Math.min(cut, vh)
  return { cut: next, remake: vw !== stillW || Math.abs(vh - stillH) > TOOLBAR_PX || vh > next }
}

/** Steps a timed batch of `k` leaves room for in the budget, at that batch's cost per step. */
export const stepsThatFit = (budgetMs: number, usedMs: number, k: number, batchMs: number) =>
  Math.floor((budgetMs - usedMs) / Math.max(batchMs / k, 0.01))

/** Size of the probe batch after the first step: up to 8 steps, none when it all fits or nothing does. */
export const probeSteps = (fits: number, left: number) => (fits >= 1 && fits < left ? Math.max(1, Math.min(8, fits >> 1)) : 0)

/** Steps to send without waiting once the timing is known, never more than are left. */
export const finalSteps = (left: number, fits: number) => Math.min(left, fits)

/** WebGPU cannot wait on the main thread, so the GPU time of a step measured at start caps the count. */
export const gpuCappedSteps = (steps: number, budgetMs: number, stepCost: number) =>
  Math.min(steps, Math.max(1, Math.floor(budgetMs / stepCost)))
